'use client';

import { useTextos } from '@/i18n/cliente';
import { Hoja } from '../panel/Piezas';
import { primerNombre } from '../panel/utiles';
import { MandarRutina } from '../MandarRutina';

/**
 * «RUTINA GUARDADA. ¿SE LA MANDÁS?» (098)
 *
 * Solo después de guardar una rutina que el cliente ya ve (la vigente): es
 * el momento en que el trainer tiene que avisarle. El botón es el mismo
 * `MandarRutina` de la carpeta y de Clientes, con el token que devolvió
 * `guardar_rutina`, así que es un link común y el iPhone no lo bloquea.
 *
 * Cerrar la hoja es seguir editando; «Volver a su carpeta» es terminar.
 */
export function HojaGuardada({
  empresaId, zona, cliente, token, activo, nueva, listaParaSeguir, onVolver, onSeguir,
}: {
  empresaId: string;
  zona: string;
  cliente: { id: string; nombre: string; telefono: string };
  token: string | null;
  /** Si su link está prendido (un link apagado no se manda: se ofrece prenderlo). */
  activo: boolean;
  /** Recién creada (si no, se editó la que ya veía). */
  nueva: boolean;
  /** Ya llegó la rutina guardada (con los ids nuevos) y se puede seguir editando. */
  listaParaSeguir: boolean;
  onVolver: () => void;
  onSeguir: () => void;
}) {
  const t = useTextos();
  const g = t.rutinasEditor.guardada;
  const pila = primerNombre(cliente.nombre) || cliente.nombre;

  return (
    // Hasta que llega la rutina guardada no se vuelve a editar: sin los ids
    // nuevos, el próximo guardado borraría y volvería a crear lo recién
    // agregado (y el cliente perdería sus tildes).
    <Hoja titulo={`✓ ${g.titulo}`} onCerrar={onSeguir} bloqueada={!listaParaSeguir}>
      <p className="text-[14.5px] leading-relaxed text-tinta/75">{nueva ? g.nueva(pila) : g.cambios(pila)}</p>
      <div className="mt-4 space-y-2.5">
        <MandarRutina
          empresaId={empresaId} clienteId={cliente.id} nombre={cliente.nombre}
          telefono={cliente.telefono} zona={zona} token={token} activo={activo}
        />
        <button type="button" onClick={onVolver} className="boton-suave min-h-[48px] w-full">{g.volver}</button>
        <button
          type="button" onClick={onSeguir} disabled={!listaParaSeguir}
          className="boton-texto min-h-[44px] w-full disabled:opacity-50"
        >
          {listaParaSeguir ? g.seguir : t.comun.cargando}
        </button>
      </div>
    </Hoja>
  );
}
