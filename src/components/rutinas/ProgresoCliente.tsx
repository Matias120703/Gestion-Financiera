'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTextos } from '@/i18n/cliente';
import { enlaceWhatsApp, telefonoInternacional } from '@/lib/telefono';
import { MEDIDAS, categoriaImc, inicioContraAhora } from '@/lib/medidas';
import type { Medicion, ProgresoCliente as DatosProgreso } from '@/lib/tipos-rutinas';
import { AnotarControl } from './AnotarControl';
import { Hoja, MensajeError, MensajeListo } from './panel/Piezas';
import { armarResumen, resumirCambios } from './panel/resumen';
import { cifra, conSigno, copiarTexto, fechaCorta, primerNombre } from './panel/utiles';

/**
 * EL PROGRESO DE UN CLIENTE (098): la pestaña Progreso de su carpeta.
 * Solo la ve el dueño o un admin: las medidas son datos de salud.
 *
 * - «Anotar control»: peso y medidas con su fecha (AnotarControl).
 * - Una tarjeta por medida con Inicio · Ahora · Diferencia. Neutras: que la
 *   cintura baje es bueno para uno y no importa para otro, y el objetivo de
 *   cada persona quedó fuera de la fase 1. Sin verde ni rojo, sin flechas.
 * - El IMC con su categoría de la OMS, cuando hay peso y altura, con la
 *   aclaración de que no distingue músculo de grasa.
 * - «Cómo subieron las cargas»: lo que quedó anotado cada vez que se cambió
 *   la carga de la rutina vigente («Sentadilla: 40 kg → 50 kg, desde el 15/08»).
 * - «Mandar resumen por WhatsApp»: un texto que el trainer lee y retoca
 *   ANTES de mandar. Las medidas nunca salen sin que él las vea.
 * - Los controles anotados, para corregir o borrar uno.
 */
export function ProgresoCliente({
  empresaId, zona, hoy, progreso, abrirAnotar,
}: {
  empresaId: string;
  zona: string;
  hoy: string;
  progreso: DatosProgreso;
  /** Llegó desde «Para atender · anotar control»: la hoja ya abierta. */
  abrirAnotar: boolean;
}) {
  const t = useTextos();
  const p = t.rutinasPanel.progreso;
  const nombres = t.rutinasComun.medidas;
  const locale = useLocale();
  const router = useRouter();
  const { cliente } = progreso;
  const pila = primerNombre(cliente.nombre) || cliente.nombre;

  const [hoja, setHoja] = useState<{ control: Medicion | null } | null>(abrirAnotar ? { control: null } : null);
  const [aviso, setAviso] = useState('');
  const [resumen, setResumen] = useState<string | null>(null);

  const mediciones = progreso.mediciones;
  const ia = useMemo(() => inicioContraAhora(mediciones), [mediciones]);
  const recientes = useMemo(() => [...mediciones].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)), [mediciones]);

  const textoResumen = useMemo(() => armarResumen({
    nombre: cliente.nombre,
    mediciones,
    cargas: progreso.cargas,
    textos: { ...t.rutinasPanel.resumen, medidas: nombres },
    locale,
    hoy,
  }), [cliente.nombre, mediciones, progreso.cargas, t, nombres, locale, hoy]);

  const fecha = (iso: string) => fechaCorta(iso, locale, hoy);

  function cerrarHoja() {
    setHoja(null);
    // Que un «atrás» o un refresco no vuelva a abrir la hoja.
    if (abrirAnotar) router.replace(`/rutinas/cliente/${cliente.id}?ver=progreso`, { scroll: false });
  }

  const imcAhora = ia.imc ? categoriaImc(ia.imc.ahora) : null;

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => { setAviso(''); setHoja({ control: null }); }} className="boton-principal min-h-[48px] w-full">
        + {p.anotarControl}
      </button>

      <MensajeListo texto={aviso} />

      {mediciones.length === 0 ? (
        <div className="tarjeta px-5 py-8 text-center">
          <p className="text-[15px] font-bold">{p.ningunControl}</p>
          <p className="mx-auto mt-1 max-w-xs text-[13.5px] leading-relaxed text-tinta/55">{p.ningunControlDetalle(pila)}</p>
        </div>
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {MEDIDAS.map((def) => {
            const x = ia[def.clave];
            if (!x) return null;
            const u = nombres[def.clave].unidad;
            const valor = (n: number) => `${cifra(n, locale, def.decimales)} ${u}`;
            return (
              <li key={def.clave} className="tarjeta p-3.5">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="min-w-0 truncate text-[14px] font-bold">{nombres[def.clave].nombre}</p>
                  {def.clave === 'grasa_pct' && x.metodo && (
                    <span className="shrink-0 text-[12px] text-tinta/50">{t.rutinasComun.metodosGrasa[x.metodo]}</span>
                  )}
                </div>
                {def.clave === 'altura_cm' ? (
                  <div className="mt-1.5">
                    <p className="text-[11.5px] font-semibold text-tinta/50">{p.ultima}</p>
                    <p className="text-[16px] font-bold tabular-nums">{valor(x.ahora)}</p>
                    <p className="text-[11.5px] tabular-nums text-tinta/45">{fecha(x.fechaAhora)}</p>
                  </div>
                ) : (
                  <InicioAhora
                    inicio={valor(x.inicio)} fechaInicio={fecha(x.fechaInicio)}
                    ahora={valor(x.ahora)} fechaAhora={fecha(x.fechaAhora)}
                    diferencia={x.diferencia === null ? t.comun.sinDato : `${conSigno(x.diferencia, locale, def.decimales)} ${u}`}
                  />
                )}
              </li>
            );
          })}
          {ia.imc && (
            <li className="tarjeta p-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[14px] font-bold">{t.rutinasComun.imc}</p>
                {imcAhora && <span className="pastilla bg-arena text-tinta/65">{t.rutinasComun.categoriasImc[imcAhora]}</span>}
              </div>
              <InicioAhora
                inicio={cifra(ia.imc.inicio, locale)} fechaInicio={fecha(ia.imc.fechaInicio)}
                ahora={cifra(ia.imc.ahora, locale)} fechaAhora={fecha(ia.imc.fechaAhora)}
                diferencia={ia.imc.diferencia === null ? t.comun.sinDato : conSigno(ia.imc.diferencia, locale)}
              />
              <p className="mt-2 text-[11.5px] leading-snug text-tinta/45">{p.imcAyuda}</p>
            </li>
          )}
        </ul>
      )}

      <Cargas progreso={progreso} hoy={hoy} />

      <section className="tarjeta p-4">
        <button
          type="button" disabled={!textoResumen} onClick={() => setResumen(textoResumen)}
          className="boton-suave min-h-[48px] w-full"
        >
          {p.mandarResumen}
        </button>
        {!textoResumen && <p className="mt-2 text-[12.5px] leading-snug text-tinta/50">{p.nadaParaResumir}</p>}
      </section>

      {recientes.length > 0 && (
        <section className="tarjeta overflow-hidden">
          <div className="px-4 pb-1 pt-4">
            <h3 className="text-[15px] font-bold tracking-tight">{p.historial}</h3>
            <p className="text-[12.5px] text-tinta/50">{p.historialAyuda}</p>
          </div>
          <ul className="divide-y divide-borde">
            {recientes.map((m) => (
              <li key={m.id}>
                <button
                  type="button" onClick={() => { setAviso(''); setHoja({ control: m }); }}
                  className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-arena/60"
                >
                  <span className="min-w-[3.5rem] shrink-0 text-[14px] font-bold tabular-nums">{fecha(m.fecha)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-tinta/70">{resumenControl(m, nombres, locale)}</span>
                    {m.nota.trim() && <span className="block truncate text-[12px] italic text-tinta/45">{m.nota.trim()}</span>}
                  </span>
                  <span aria-hidden className="shrink-0 text-[18px] text-tinta/30">›</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hoja && (
        <AnotarControl
          // Con `key`, «Corregir ese control» monta la hoja de nuevo con ese
          // control. Sin ella React conservaba la instancia, y el formulario
          // (que se arma una sola vez desde `control`) seguía mostrando lo
          // recién tipeado; al guardar, lo que ese control tenía y no
          // estaba en pantalla se borraba en silencio.
          key={hoja.control?.id ?? 'nuevo'}
          empresaId={empresaId}
          clienteId={cliente.id}
          nombre={cliente.nombre}
          hoy={hoy}
          mediciones={mediciones}
          consintio={!!progreso.consiente_medidas_at}
          control={hoja.control}
          onCerrar={cerrarHoja}
          onListo={(mensaje) => { cerrarHoja(); setAviso(mensaje); }}
          // «Corregir ese control»: esa fecha ya tenía uno, y en vez de
          // completarlo se abre para corregirlo.
          onCorregir={(m) => { setAviso(''); setHoja({ control: m }); }}
        />
      )}

      {resumen !== null && (
        <HojaResumen
          texto={resumen} onCambiar={setResumen} onCerrar={() => setResumen(null)}
          telefono={cliente.telefono} zona={zona} pila={pila}
        />
      )}
    </div>
  );
}

function InicioAhora({
  inicio, fechaInicio, ahora, fechaAhora, diferencia,
}: {
  inicio: string;
  fechaInicio: string;
  ahora: string;
  fechaAhora: string;
  diferencia: string;
}) {
  const t = useTextos();
  const p = t.rutinasPanel.progreso;
  return (
    <dl className="mt-1.5 grid grid-cols-3 gap-2">
      <div className="min-w-0">
        <dt className="text-[11.5px] font-semibold text-tinta/50">{p.inicio}</dt>
        <dd className="text-[14.5px] font-semibold tabular-nums text-tinta/75">{inicio}</dd>
        <dd className="text-[11.5px] tabular-nums text-tinta/45">{fechaInicio}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-[11.5px] font-semibold text-tinta/50">{p.ahora}</dt>
        <dd className="text-[14.5px] font-bold tabular-nums">{ahora}</dd>
        <dd className="text-[11.5px] tabular-nums text-tinta/45">{fechaAhora}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-[11.5px] font-semibold text-tinta/50">{p.diferencia}</dt>
        <dd className="text-[14.5px] font-bold tabular-nums">{diferencia}</dd>
      </div>
    </dl>
  );
}

/** «Peso 78,4 kg · Cintura 85 cm · +3»: lo que se anotó ese día, en una línea. */
function resumenControl(
  m: Medicion,
  nombres: Record<string, { nombre: string; unidad: string }>,
  locale: string,
): string {
  const con = MEDIDAS.filter((d) => m[d.clave] !== null && m[d.clave] !== undefined);
  const partes = con.slice(0, 3).map((d) => `${nombres[d.clave].nombre} ${cifra(Number(m[d.clave]), locale, d.decimales)} ${nombres[d.clave].unidad}`);
  if (con.length > 3) partes.push(`+${con.length - 3}`);
  return partes.join(' · ');
}

/** «Cómo subieron las cargas», ejercicio por ejercicio. */
function Cargas({ progreso, hoy }: { progreso: DatosProgreso; hoy: string }) {
  const t = useTextos();
  const p = t.rutinasPanel.progreso;
  const locale = useLocale();
  const fecha = (iso: string) => fechaCorta(iso, locale, hoy);

  const filas = progreso.cargas
    .map((g) => ({ g, r: resumirCambios(Array.isArray(g.cambios) ? g.cambios : []) }))
    .filter(({ r }) => r.carga || r.reps);

  return (
    <section className="tarjeta p-4">
      <h3 className="text-[15px] font-bold tracking-tight">{p.cargas}</h3>
      <p className="text-[12.5px] leading-snug text-tinta/50">{p.cargasAyuda}</p>
      {filas.length === 0 ? (
        <p className="mt-3 text-[13.5px] text-tinta/55">{p.sinCargas}</p>
      ) : (
        <ul className="mt-2 divide-y divide-borde">
          {filas.map(({ g, r }) => (
            <li key={g.ejercicio_id} className="py-2.5">
              <p className="text-[14.5px] font-bold">{g.nombre}</p>
              {r.carga && (
                <>
                  <p className="text-[13.5px] tabular-nums text-tinta/75">
                    {p.cargaLinea(r.carga.antes || p.sinCarga, r.carga.despues || p.sinCarga, fecha(r.carga.desde))}
                  </p>
                  {/* El camino, si hubo más de un cambio: «40 kg → 45 kg (01/09) → 50 kg (15/09)». */}
                  {r.carga.pasos.length > 1 && (
                    <p className="text-[12px] tabular-nums text-tinta/45">
                      {[r.carga.antes || p.sinCarga, ...r.carga.pasos.map((s) => `${s.valor || p.sinCarga} (${fecha(s.fecha)})`)].join(' → ')}
                    </p>
                  )}
                </>
              )}
              {r.reps && (
                <p className="text-[13.5px] tabular-nums text-tinta/75">
                  {p.repsLinea(r.reps.antes || '—', r.reps.despues || '—', fecha(r.reps.desde))}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * El resumen, en un cuadro que el trainer lee y retoca. Recién al tocar
 * «Mandar» sale, y sale solo lo que dice el cuadro. Con teléfono va por
 * WhatsApp (un link común: sin esperar nada, el iPhone no lo bloquea);
 * sin teléfono, el menú de compartir del celular o, si no hay, copiar.
 */
function HojaResumen({
  texto, onCambiar, onCerrar, telefono, zona, pila,
}: {
  texto: string;
  onCambiar: (texto: string) => void;
  onCerrar: () => void;
  telefono: string;
  zona: string;
  pila: string;
}) {
  const t = useTextos();
  const r = t.rutinasPanel.resumen;
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');

  const limpio = texto.trim();
  const conTelefono = telefonoInternacional(telefono ?? '', zona) !== '';
  const whatsapp = limpio ? enlaceWhatsApp(telefono ?? '', zona, limpio) : '';

  async function copiar() {
    setAviso('');
    setError('');
    if (!limpio) { setError(r.vacio); return; }
    if (await copiarTexto(limpio)) setAviso(r.copiado);
    else setError(t.rutinasPanel.carpeta.noSeCopio);
  }

  async function compartir() {
    setAviso('');
    setError('');
    if (!limpio) { setError(r.vacio); return; }
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text: limpio });
        return;
      } catch (e) {
        // Cerró el menú sin elegir: no pasó nada.
        if ((e as { name?: string })?.name === 'AbortError') return;
      }
    }
    await copiar();
  }

  return (
    <Hoja titulo={r.titulo} onCerrar={onCerrar}>
      <p className="text-[13px] leading-relaxed text-tinta/60">{r.ayuda}</p>
      <textarea
        className="campo mt-3 min-h-[220px] resize-y leading-relaxed" value={texto}
        onChange={(e) => { onCambiar(e.target.value); setAviso(''); setError(''); }}
        aria-label={r.titulo}
      />
      {aviso && <p role="status" className="mt-2 text-[13px] font-semibold text-verde-fuerte">✓ {aviso}</p>}
      <MensajeError texto={error} />
      <div className="mt-4 grid gap-2.5">
        {conTelefono ? (
          whatsapp ? (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="boton-principal min-h-[48px] w-full">
              {t.rutinasComun.acciones.mandarWhatsapp}
            </a>
          ) : (
            <button type="button" disabled className="boton-principal min-h-[48px] w-full">{t.rutinasComun.acciones.mandarWhatsapp}</button>
          )
        ) : (
          <button type="button" onClick={compartir} disabled={!limpio} className="boton-principal min-h-[48px] w-full">
            {r.compartir}
          </button>
        )}
        <button type="button" onClick={copiar} disabled={!limpio} className="boton-suave min-h-[48px] w-full">
          {r.copiar}
        </button>
        {!conTelefono && <p className="text-[12px] leading-snug text-tinta/50">{r.sinTelefono(pila)}</p>}
      </div>
    </Hoja>
  );
}
