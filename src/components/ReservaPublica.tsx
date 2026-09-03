'use client';

import { useEffect, useMemo, useState } from 'react';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { dinero, fechaLarga } from '@/lib/formato';
import { sumarDias } from '@/lib/fechas';
import type { AgendaPublica, ProfesionalPublico, ServicioPublico } from '@/lib/tipos';

/**
 * RESERVAR UN TURNO · lo que ve el cliente
 *
 * Entra desde Instagram, con datos móviles y apurado. Cuatro pasos, uno por
 * pantalla, y nada de cuentas ni contraseñas: qué servicio, con quién, qué
 * día y a qué hora, y cómo se llama.
 *
 * Los textos van en castellano directo y no por el diccionario de Orden: acá
 * no hay sesión, así que no hay idioma elegido, y el que reserva no es
 * usuario del sistema. El idioma que corresponde es el del barrio.
 */

type Paso = 'servicio' | 'dia' | 'datos' | 'listo';

export function ReservaPublica({ slug, datos }: { slug: string; datos: AgendaPublica }) {
  const profesionales = datos.profesionales ?? [];

  const [paso, setPaso] = useState<Paso>('servicio');
  const [profesional, setProfesional] = useState<ProfesionalPublico | null>(
    profesionales.length === 1 ? profesionales[0] : null,
  );
  const [servicio, setServicio] = useState<ServicioPublico | null>(null);
  const [dia, setDia] = useState('');
  const [hora, setHora] = useState('');
  const [huecos, setHuecos] = useState<string[] | null>(null);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [listo, setListo] = useState<{ token: string; inicia: string } | null>(null);

  const plata = (n: number) => dinero(n, datos.moneda, true, 'es-PY');

  // Los próximos catorce días. Más que eso no entra en una pantalla y nadie
  // reserva un corte para dentro de dos meses.
  const dias = useMemo(() => {
    const hoy = new Date();
    const base = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    return Array.from({ length: 14 }, (_, i) => sumarDias(base, i));
  }, []);

  useEffect(() => {
    if (!profesional || !servicio || !dia) { setHuecos(null); return; }
    let vigente = true;
    setHuecos(null);
    (async () => {
      const { data } = await clienteNavegador().rpc('huecos_publicos', {
        p_slug: slug,
        p_profesional: profesional.id,
        p_producto: servicio.id,
        p_fecha: dia,
      });
      if (vigente) setHuecos(Array.isArray(data) ? data : []);
    })();
    return () => { vigente = false; };
  }, [slug, profesional, servicio, dia]);

  async function confirmar() {
    setCargando(true);
    setError('');
    try {
      const { data, error: fallo } = await clienteNavegador().rpc('reservar_publico', {
        p_slug: slug,
        p_profesional: profesional!.id,
        p_producto: servicio!.id,
        p_inicia: hora,
        p_nombre: nombre.trim(),
        p_telefono: telefono.trim(),
      });
      if (fallo) throw fallo;
      setListo({ token: (data as any).token, inicia: (data as any).inicia });
      setPaso('listo');
    } catch (e: any) {
      // El mensaje viene de la base y está escrito para leerse: «Ese horario
      // ya no está disponible», «Esperá un momento antes de tomar otro turno».
      setError(e?.message ?? 'No se pudo reservar. Probá de nuevo.');
      // Si el hueco se lo llevó otro mientras completaba, se refresca la
      // lista: mostrarle el mismo horario otra vez sería mentirle dos veces.
      setHuecos(null);
      setHora('');
    } finally {
      setCargando(false);
    }
  }

  const horaLegible = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', hour12: false });

  // ---------- pantalla final ----------
  if (paso === 'listo' && listo) {
    return (
      <Marco datos={datos}>
        <div className="rounded-2xl border border-verde/30 bg-verde-claro p-5 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-verde text-2xl text-white">✓</div>
          <h2 className="mt-3 text-[19px] font-bold tracking-tight text-verde-fuerte">Turno reservado</h2>
          <p className="mt-1 text-[15px] leading-relaxed text-tinta/70">
            {fechaLarga(listo.inicia.slice(0, 10), 'es-PY')} a las <b>{horaLegible(listo.inicia)}</b>
            <br />
            {servicio?.nombre} con {profesional?.nombre}
          </p>
        </div>

        <div className="mt-4 rounded-2xl border border-borde bg-white p-4">
          <p className="text-[13.5px] font-semibold">Guardá este enlace</p>
          <p className="mt-1 text-[13px] leading-relaxed text-tinta/55">
            Es lo único que necesitás si después no podés venir. Cancelar a tiempo le deja el
            lugar a otra persona.
          </p>
          <a
            href={`/turno/${listo.token}`}
            className="boton-suave mt-3 block w-full py-2.5 text-center"
          >
            Ver o cancelar mi turno
          </a>
        </div>
      </Marco>
    );
  }

  // ---------- el formulario ----------
  return (
    <Marco datos={datos}>
      {profesionales.length === 0 ? (
        <div className="rounded-2xl border border-borde bg-white p-5 text-center">
          <p className="text-[15px] leading-relaxed text-tinta/60">
            Todavía no hay horarios cargados para reservar por acá. Escribile al local directamente.
          </p>
        </div>
      ) : (
        <>
          {/* ---- con quién ---- */}
          {profesionales.length > 1 && (
            <Bloque titulo="¿Con quién?">
              <div className="grid gap-2 sm:grid-cols-2">
                {profesionales.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setProfesional(p); setServicio(null); setHora(''); }}
                    className={`rounded-xl border p-3 text-left text-[14.5px] font-semibold transition ${
                      profesional?.id === p.id
                        ? 'border-verde bg-verde-claro text-verde-fuerte'
                        : 'border-borde bg-white hover:border-verde/40'
                    }`}
                  >
                    {p.nombre}
                  </button>
                ))}
              </div>
            </Bloque>
          )}

          {/* ---- qué servicio ---- */}
          {profesional && (
            <Bloque titulo="¿Qué te hacés?">
              <div className="space-y-2">
                {(profesional.servicios ?? []).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { setServicio(s); setHora(''); if (!dia) setDia(dias[0]); }}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${
                      servicio?.id === s.id
                        ? 'border-verde bg-verde-claro'
                        : 'border-borde bg-white hover:border-verde/40'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[14.5px] font-semibold">{s.nombre}</span>
                      <span className="mt-0.5 block text-[12.5px] text-tinta/50">{s.duracion} minutos</span>
                    </span>
                    <span className="shrink-0 text-[15px] font-bold tabular-nums">
                      {plata(Number(s.precio))}
                    </span>
                  </button>
                ))}
                {(profesional.servicios ?? []).length === 0 && (
                  <p className="text-[13.5px] text-tinta/55">
                    No hay servicios disponibles para reservar.
                  </p>
                )}
              </div>
            </Bloque>
          )}

          {/* ---- qué día ---- */}
          {profesional && servicio && (
            <Bloque titulo="¿Qué día?">
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {dias.map((d) => {
                  const f = new Date(`${d}T12:00:00`);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => { setDia(d); setHora(''); }}
                      className={`shrink-0 rounded-xl border px-3 py-2 text-center transition ${
                        dia === d ? 'border-verde bg-verde-claro text-verde-fuerte' : 'border-borde bg-white'
                      }`}
                    >
                      <span className="block text-[11px] uppercase tracking-wide text-tinta/45">
                        {f.toLocaleDateString('es-PY', { weekday: 'short' })}
                      </span>
                      <span className="block text-[15px] font-bold tabular-nums">{f.getDate()}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3">
                {huecos === null ? (
                  <p className="py-3 text-center text-[13.5px] text-tinta/45">Buscando horarios…</p>
                ) : huecos.length === 0 ? (
                  <p className="rounded-xl bg-arena px-3 py-3 text-center text-[13.5px] leading-relaxed text-tinta/55">
                    Ese día no queda ningún horario libre. Probá con otro.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {huecos.map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => { setHora(h); setPaso('datos'); }}
                        className={`rounded-lg border py-2.5 text-center text-[14px] font-semibold tabular-nums transition ${
                          hora === h
                            ? 'border-verde bg-verde text-white'
                            : 'border-borde bg-white hover:border-verde/50'
                        }`}
                      >
                        {horaLegible(h)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Bloque>
          )}

          {/* ---- quién sos ---- */}
          {hora && (
            <Bloque titulo="¿Y vos quién sos?">
              <div className="space-y-3">
                <div>
                  <label className="etiqueta" htmlFor="pub-nombre">Tu nombre</label>
                  <input
                    id="pub-nombre" className="campo" maxLength={80} autoFocus
                    value={nombre} onChange={(e) => setNombre(e.target.value)}
                  />
                </div>
                <div>
                  <label className="etiqueta" htmlFor="pub-tel">Tu teléfono</label>
                  <input
                    id="pub-tel" className="campo" inputMode="tel" maxLength={40}
                    placeholder="0981 000 000"
                    value={telefono} onChange={(e) => setTelefono(e.target.value)}
                  />
                  <p className="mt-1.5 text-[12px] leading-snug text-tinta/45">
                    Solo lo usa el local para avisarte si pasa algo con tu turno.
                  </p>
                </div>

                {error && (
                  <p role="alert" className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  className="boton-principal w-full py-3"
                  disabled={cargando || nombre.trim() === '' || telefono.trim().length < 6}
                  onClick={confirmar}
                >
                  {cargando ? 'Reservando…' : `Reservar ${horaLegible(hora)}`}
                </button>
              </div>
            </Bloque>
          )}

          {error && !hora && (
            <p role="alert" className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">
              {error}
            </p>
          )}
        </>
      )}
    </Marco>
  );
}

function Marco({ datos, children }: { datos: AgendaPublica; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-arena">
      <div className="mx-auto max-w-lg px-4 pb-16 pt-8">
        <header className="mb-5 text-center">
          <h1 className="text-[24px] font-bold tracking-tight">{datos.negocio}</h1>
          {datos.direccion && (
            <p className="mt-1 text-[13.5px] text-tinta/55">{datos.direccion}</p>
          )}
          {datos.mensaje && (
            <p className="mt-2 text-[14px] leading-relaxed text-tinta/65">{datos.mensaje}</p>
          )}
        </header>

        <div className="space-y-4">{children}</div>

        {/* Discreto a propósito: esta página es del barbero, no nuestra. */}
        <p className="mt-8 text-center text-[11.5px] text-tinta/35">
          Turnos con Orden
        </p>
      </div>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-borde bg-white p-4">
      <h2 className="mb-3 text-[15px] font-bold tracking-tight">{titulo}</h2>
      {children}
    </section>
  );
}
