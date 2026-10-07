'use client';

import { useState } from 'react';
import { Celular, Tilde, type ItemBarra } from '@/components/portada/pantallas/Celular';
import {
  Anuncio, ControlEscena, FiguraCelular, Pestanias, SeccionEscena, useAlVerse, useSecuencia,
} from '@/components/portada/escenas/base';
import {
  CSS_ESCENA_CARGAR, CUADRO, DURACIONES, Flotante, IconoModo, MODOS, PantallaCargar, faseDe, type ModoCarga,
} from '@/components/portada/escenas/EscenaCargar.cuadros';
import { useLocale, useTextos } from '@/i18n/cliente';
import { cargarEs, cargarPt, type TextosCargar } from '@/i18n/textos/escenas/cargar';
import { vitrinaEs, vitrinaPt } from '@/i18n/textos/vitrina';

/**
 * LA ESCENA «CARGAR» DE LA PORTADA (02/10/2026): «Cargar te tiene que llevar
 * menos que cobrar».
 *
 * Perfumería Aurora (el comercio de la vitrina) carga de tres formas —
 * hablando, con una foto, escribiendo— con la pantalla REAL de la captura
 * adentro del celular y, afuera, quién lo hace y con qué: la persona que
 * acaba de cobrar con el billete en la mano y su globo diciendo lo que
 * vendió, la boleta del gasto, el lápiz. Lo que se entiende sin leer: Orden
 * lo ordena y NADA se guarda hasta que tocás «Guardar».
 *
 * Cómo se mueve (la regla de base.tsx): el HTML del servidor es la revisión
 * completa y quieta, con «Guardar» a la vista. Al verse por primera vez corre
 * UNA pasada de 3,9 s (menú → captura → entendiendo → revisión) y se queda
 * esperando al dedo; tocar «Guardar» —el botón de abajo o el celular
 * entero— cierra la hoja y vuelve el panel con «Lo cargaste así». Cambiar de
 * pestaña arranca ese modo desde el menú. Con «reducir movimiento» no hay
 * pasada ni dedo: la revisión quieta, y «Guardar» cambia el cuadro en seco.
 *
 * Lo que dibujan las pantallas vive en EscenaCargar.cuadros.tsx; los textos
 * propios en i18n/textos/escenas/cargar.ts; lo que ya dice la app se lee de
 * `useTextos()` (t.captura, t.comun) para decir lo mismo letra por letra.
 */
export function EscenaCargar({ idioma }: { idioma: 'es' | 'pt' }): JSX.Element {
  const x: TextosCargar = idioma === 'pt' ? cargarPt : cargarEs;
  const v = idioma === 'pt' ? vitrinaPt : vitrinaEs;
  const t = useTextos();
  const locale = useLocale();

  const [modo, setModo] = useState<ModoCarga>('voz');
  // Si el visitante tocó una pestaña antes de que la sección se viera entera,
  // la pasada ya arrancó: que verla después no la reinicie.
  const [tocado, setTocado] = useState(false);
  const [anuncio, setAnuncio] = useState('');
  const { ref, visto, reducido } = useAlVerse<HTMLElement>();
  const s = useSecuencia(DURACIONES, {
    arranca: (visto || tocado) && !reducido,
    inicial: CUADRO.revision,
    reducido,
  });

  // En el cuadro inicial (servidor, sin JavaScript, reducir movimiento) nada
  // se mueve: ni dedo, ni latido, ni números que suben.
  const animado = s.estado !== 'final';
  // «Guardar» existe solo en la revisión: también en el cuadro inicial (es lo
  // que ve quien lee sin JavaScript y quien pidió reducir movimiento).
  const puedeGuardar = s.cuadro === CUADRO.revision;
  const cargado = s.cuadro === CUADRO.cargado;
  const queda = x.escenas[modo].queda;

  const cambiarModo = (m: ModoCarga) => {
    setModo(m);
    setTocado(true);
    setAnuncio(x.modos[m].linea);
    // Arranca ese modo desde el menú; con reducir movimiento va directo a la revisión.
    s.repetir();
  };

  const guardar = () => {
    if (!puedeGuardar) return;
    s.irA(CUADRO.cargado);
    setAnuncio(x.guardado(queda));
  };

  // «Ver de nuevo» también cuenta como tocar: si se apretó antes de que la
  // sección se viera entera, verla después no reinicia la pasada.
  const repetir = () => {
    setTocado(true);
    s.repetir();
  };

  const barra: ItemBarra[] = [
    { icono: 'panel', texto: v.barra.panel },
    { icono: 'vender', texto: v.barra.vender },
    { icono: 'gastos', texto: v.barra.gastos },
    { icono: 'cierre', texto: v.barra.cierre },
  ];

  // La nota de los vendedores y las cinco frases. A 375 px van al final, a
  // todo el ancho (`aparte`), debajo del celular y de «Guardar»; desde `lg`
  // van en la columna de texto, debajo de las pestañas: el celular es más
  // alto que el texto y, al pie de la sección, dejaban un hueco de media
  // pantalla en blanco. Es el mismo bloque dos veces y solo uno se muestra
  // (`hidden` es display:none: el lector de pantalla tampoco lo repite).
  const notaYFrases = (
    <div className="max-w-xl">
      <p className="flex items-start gap-2.5 text-[13.5px] leading-relaxed text-tinta/60">
        <span className="mt-px grid h-6 w-6 shrink-0 place-items-center rounded-full bg-verde-claro text-verde-fuerte">
          {ICONO_EQUIPO}
        </span>
        <span>{x.notaVendedores}</span>
      </p>

      {/* Las cinco frases que antes rotaban solas: ahora las abre quien quiere. */}
      <details className="tarjeta group mt-5 overflow-hidden">
        <summary
          className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-4 px-5 py-3
                     text-[14.5px] font-bold leading-snug tracking-tight transition hover:bg-arena/60
                     focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2
                     focus-visible:outline-verde [&::-webkit-details-marker]:hidden"
        >
          {x.masCosas}
          <svg
            viewBox="0 0 24 24" aria-hidden
            className="h-4 w-4 shrink-0 text-tinta/40 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
            fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </summary>
        <ul className="divide-y divide-borde border-t border-borde">
          {x.frases.map((f) => (
            <li key={f.frase} className="flex flex-col gap-1.5 px-5 py-3 sm:flex-row sm:items-center sm:gap-4">
              <span className="pastilla w-fit shrink-0 bg-arena text-tinta/60">{f.rubro}</span>
              <span className="text-[14px] italic leading-snug text-tinta/80">{f.frase}</span>
              <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-verde-fuerte sm:ml-auto sm:shrink-0">
                <Tilde className="h-3.5 w-3.5 shrink-0" />
                {f.queda}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );

  // Las tres pestañas y, debajo, el renglón que explica el modo (dos
  // renglones de alto reservados: cambiar de modo no mueve el celular).
  const cabecera = (
    <>
      <Pestanias
        etiqueta={x.pestanias}
        columnas={3}
        valor={modo}
        onCambio={cambiarModo}
        opciones={MODOS.map((m) => ({
          clave: m,
          texto: x.modos[m].texto,
          textoCorto: x.modos[m].corto,
          icono: <IconoModo modo={m} className="h-4 w-4" />,
        }))}
      />
      <p
        key={`linea-${modo}`}
        className="mt-3 min-h-[44px] text-[14.5px] leading-snug text-tinta/60 motion-safe:animate-[aparecer_.25s_ease-out_both] lg:text-[15px]"
      >
        {x.modos[modo].linea}
      </p>
      <div className="mt-8 hidden lg:block">{notaYFrases}</div>
    </>
  );

  const figura = (
    <FiguraCelular leyenda={v.datosDeEjemplo}>
      <style>{CSS_ESCENA_CARGAR}</style>
      <Celular
        resumen={x.resumen[modo]}
        negocio={x.negocio}
        derecha={v.hoy}
        mas={v.barra.mas}
        activa={0}
        barra={barra}
        encima={(
          <>
            {/* Quién carga y con qué, flotando sobre el marco. La `key` lleva la fase
                y no el cuadro: el globo se queda mientras la captura sigue. */}
            <Flotante
              key={`flota-${s.pasada}-${modo}-${faseDe(s.cuadro)}`}
              x={x}
              modo={modo}
              fase={faseDe(s.cuadro)}
              locale={locale}
              animado={animado}
            />
            {/* El celular entero hace lo mismo que «Guardar»: solo para el dedo o el
                puntero. El marco es `role="img"`, así que el botón real está abajo. */}
            {puedeGuardar && (
              <button
                type="button"
                aria-hidden
                tabIndex={-1}
                onClick={guardar}
                className="absolute inset-0 cursor-pointer rounded-[2.7rem]"
              />
            )}
          </>
        )}
      >
        {/* Cada cambio de cuadro remonta el bloque: las entradas corren de nuevo. */}
        <div key={`${s.pasada}-${modo}-${s.cuadro}`}>
          <PantallaCargar
            x={x} v={v} t={t} modo={modo} cuadro={s.cuadro} locale={locale} animado={animado} reducido={reducido}
          />
        </div>
      </Celular>
    </FiguraCelular>
  );

  // La fila de 48 px: «Guardar» (invisible fuera de la revisión, para reservar
  // el lugar) y el botón de la animación; debajo, en un renglón ya reservado,
  // lo que quedó cargado.
  const controles = (
    <div className="w-full max-w-[292px]">
      <div className="flex min-h-[48px] items-center justify-center gap-3">
        <button
          type="button"
          onClick={guardar}
          aria-hidden={!puedeGuardar}
          tabIndex={puedeGuardar ? undefined : -1}
          className={`boton-principal min-h-[48px] flex-1 px-6 text-[15px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-verde-fuerte ${
            puedeGuardar ? '' : 'invisible'}`}
        >
          {t.comun.guardar}
        </button>
        <ControlEscena
          estado={s.estado}
          onPausar={s.pausar}
          onSeguir={s.seguir}
          onRepetir={repetir}
          textos={{ pausar: x.pausar, seguir: x.seguir, verDeNuevo: x.verDeNuevo }}
          oculto={reducido}
        />
      </div>
      <p
        key={`queda-${s.pasada}-${modo}-${cargado ? 'si' : 'no'}`}
        className={`mt-3 flex min-h-[24px] items-center justify-center gap-1.5 text-center text-[14px] font-semibold text-verde-fuerte ${
          cargado ? (animado ? 'portada-sube' : '') : 'invisible'}`}
        aria-hidden={!cargado}
      >
        <Tilde className="h-4 w-4 shrink-0" />
        {queda}
      </p>
      <Anuncio texto={anuncio} />
    </div>
  );

  const aparte = <div className="lg:hidden">{notaYFrases}</div>;

  return (
    <SeccionEscena
      id="cargar"
      refSeccion={ref}
      fondo="clara"
      lado="figura-derecha"
      etiqueta={x.etiqueta}
      titulo={x.titulo}
      tituloId="titulo-cargar"
      apoyo={x.apoyo}
      cabecera={cabecera}
      figura={figura}
      controles={controles}
      aparte={aparte}
    />
  );
}

/** Dos personas: la nota de los vendedores (el trazo de «clientes» de la barra del celular). */
const ICONO_EQUIPO = (
  <svg
    viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden
    fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
  >
    <circle cx="9" cy="8.5" r="3.2" />
    <path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8" />
    <circle cx="16.8" cy="9.5" r="2.4" />
    <path d="M16.6 14.4c2 .2 3.4 1.7 3.9 4.1" />
  </svg>
);
