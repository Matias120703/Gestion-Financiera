'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { mensajeDeError } from '@/lib/errores';
import { mensajeDeCorreoBorrado, mismoCorreo, textoDeMotivo } from '@/lib/borrar-correo';
import type { CorreoSuelto } from '@/lib/tipos';
import { Hoja, PieHoja } from '@/components/Hoja';

/**
 * «CORREOS SIN CUENTA» (/admin, 129, 07/10/2026).
 *
 * Matías: «quise ingresar con un correo y me dice que ya existe. Y la verdad
 * que no existe, porque no está en mi panel.» Existía: era un usuario sin
 * ningún negocio, y el panel solo lista negocios. Acá se ven, y se borran de
 * a uno.
 *
 * Borrar pide escribir el correo entero: un botón rojo en una lista se toca
 * por curiosidad; escribir un correo letra por letra no se hace sin querer.
 * La pantalla solo habilita el botón: quien decide es el servidor, que
 * vuelve a comparar lo escrito con el correo de ESE usuario y a comprobar
 * que siga sin ningún negocio.
 *
 * Textos en español en el propio componente, como todo el panel.
 */

// Con la zona fija: el servidor y el navegador escriben el mismo día aunque
// el servidor corra en otra hora (si no, React avisa que no coinciden).
function fecha(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-PY', {
    day: '2-digit', month: 'short', year: '2-digit', timeZone: 'America/Asuncion',
  });
}

/** «Se registró el 12 sept 26 · entró por última vez el 30 sept 26 · sin confirmar» */
function detalleDe(s: CorreoSuelto) {
  return [
    s.creado ? `Se registró el ${fecha(s.creado)}` : '',
    s.ultimo_ingreso ? `entró por última vez el ${fecha(s.ultimo_ingreso)}` : 'nunca entró',
    s.confirmado ? '' : 'sin confirmar',
  ].filter(Boolean).join(' · ');
}

function conMayuscula(texto: string) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function CorreosSueltos({ sueltos, onHecho }: {
  /** Null: no se pudo leer la lista (que no es lo mismo que «no hay ninguno»). */
  sueltos: CorreoSuelto[] | null;
  /** Lo que pasó, para decirlo arriba con la lista ya al día. */
  onHecho: (mensaje: string, ojo?: boolean) => void;
}) {
  const router = useRouter();
  const [elegido, setElegido] = useState<CorreoSuelto | null>(null);
  const [escrito, setEscrito] = useState('');
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState('');

  function abrir(s: CorreoSuelto) {
    setElegido(s);
    setEscrito('');
    setError('');
  }

  function cerrar() {
    setElegido(null);
    setEscrito('');
    setError('');
  }

  async function borrar() {
    if (!elegido) return;
    setBorrando(true);
    setError('');
    try {
      const respuesta = await fetch('/api/admin/correos/borrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: elegido.usuario, confirmacion: escrito }),
      });
      const datos = await respuesta.json().catch(() => null);
      if (respuesta.ok && datos?.ok === true) {
        const mensaje = mensajeDeCorreoBorrado(String(datos.estado ?? ''), elegido.correo);
        cerrar();
        onHecho(mensaje);
        return;
      }
      setError(mensajeDeError(datos?.error, 'No se pudo borrar ese correo.'));
      // «Ya no está suelto», «recomienda Orden»: la lista que se ve quedó vieja.
      if (respuesta.status === 409) router.refresh();
    } catch (e) {
      setError(mensajeDeError(e, 'No se pudo borrar ese correo.'));
    } finally {
      setBorrando(false);
    }
  }

  const cuantos = sueltos?.length ?? 0;

  return (
    <section className="rounded-2xl border border-borde bg-superficie">
      <div className="flex items-end justify-between gap-3 border-b border-borde p-4">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">Correos sin cuenta</h2>
          <p className="mt-0.5 max-w-2xl text-[13px] leading-relaxed text-tinta/50">
            Personas que pueden entrar a Orden y no tienen ningún negocio. Mientras el correo esté
            acá, no se puede registrar de nuevo con él.
          </p>
        </div>
        {sueltos !== null && (
          <span className="shrink-0 text-[13px] font-semibold text-tinta/40">
            {cuantos} {cuantos === 1 ? 'correo' : 'correos'}
          </span>
        )}
      </div>

      {sueltos === null ? (
        <p className="px-4 py-8 text-center text-[13.5px] font-medium text-ambar">
          No se pudo leer esta lista. Recargá la página.
        </p>
      ) : sueltos.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13.5px] text-tinta/45">No hay ninguno.</p>
      ) : (
        <ul className="divide-y divide-borde">
          {sueltos.map((s) => (
            <li key={s.usuario} className="flex items-center gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="min-w-0 break-all text-[15px] font-bold">{s.correo || 'sin correo'}</span>
                  {s.reciente && <span className="pastilla bg-ambar-claro text-ambar">Hace poco</span>}
                </p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-tinta/50">{detalleDe(s)}</p>
              </div>
              {s.se_puede && s.correo ? (
                <button
                  type="button" onClick={() => abrir(s)}
                  className="boton-suave shrink-0 border-rojo/40 px-4 py-2 text-[13px] text-rojo hover:bg-rojo-claro"
                >
                  Borrar
                </button>
              ) : (
                // Con candado, sin botón: se dice por qué.
                <span className="shrink-0 text-right text-[12.5px] font-semibold text-tinta/50">
                  {s.se_puede ? 'Sin correo' : conMayuscula(textoDeMotivo(s.motivo))}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {elegido && (
        <Hoja
          titulo="Borrar este correo"
          subtitulo={<span className="block break-all">{elegido.correo}</span>}
          onCerrar={cerrar} bloqueada={borrando} tamano="chico"
          pie={(
            <PieHoja columnas={2}>
              <button
                type="button" onClick={cerrar} disabled={borrando}
                className="boton-suave min-h-[48px] text-[13.5px]"
              >
                Mejor no
              </button>
              <button
                type="button" onClick={borrar}
                disabled={borrando || !mismoCorreo(escrito, elegido.correo)}
                className="boton-peligro min-h-[48px] text-[13.5px] disabled:opacity-40"
              >
                {borrando ? 'Borrando…' : 'Borrar el correo'}
              </button>
            </PieHoja>
          )}
        >
          <div className="space-y-3">
            <p className="text-[14px] leading-relaxed text-tinta/70">
              Se borra el usuario: no va a poder entrar más. Si quiere volver, se registra de nuevo
              con el mismo correo. No se borra ningún negocio.
            </p>
            {elegido.reciente && (
              <p className="rounded-xl bg-ambar-claro px-3.5 py-2.5 text-[13px] font-medium text-ambar">
                Se registró hace poco. Puede estar por terminar de crear su cuenta o por unirse a un negocio.
              </p>
            )}
            {elegido.con_codigo && (
              <p className="rounded-xl bg-ambar-claro px-3.5 py-2.5 text-[13px] font-medium text-ambar">
                Vino por el enlace de un socio. Si vuelve sin ese enlace, el socio no cobra.
              </p>
            )}
            <label className="block">
              <span className="block text-[13px] leading-relaxed text-tinta/70">
                Para confirmar, escribí <strong className="break-all text-tinta">{elegido.correo}</strong>.
              </span>
              <input
                className="campo mt-2" type="email" inputMode="email"
                autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false}
                value={escrito} onChange={(e) => setEscrito(e.target.value)}
                placeholder={elegido.correo} disabled={borrando}
              />
            </label>
            {error && (
              <p role="alert" className="rounded-xl bg-rojo-claro px-3.5 py-2.5 text-[13px] font-medium text-rojo">{error}</p>
            )}
          </div>
        </Hoja>
      )}
    </section>
  );
}
