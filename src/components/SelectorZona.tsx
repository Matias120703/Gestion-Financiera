'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { useTextos } from '@/i18n/cliente';
import { mensajeDeError } from '@/lib/errores';

/**
 * Zona horaria del negocio.
 *
 * Decide qué día es "hoy" para el cierre y la racha. Antes estaba clavada en
 * America/Asuncion: un negocio en São Paulo veía el cierre del día
 * equivocado durante una hora todas las noches, y la racha se le cortaba sola.
 *
 * La lista sale de `Intl.supportedValuesOf('timeZone')` cuando el navegador
 * la tiene, que es la lista completa y siempre actualizada. Los navegadores
 * viejos caen a un puñado de zonas de América y Europa, que cubre a quien
 * usa esto hoy.
 */
const RESPALDO = [
  'America/Asuncion', 'America/Argentina/Buenos_Aires', 'America/Sao_Paulo',
  'America/Santiago', 'America/Montevideo', 'America/La_Paz', 'America/Lima',
  'America/Bogota', 'America/Mexico_City', 'America/New_York', 'America/Los_Angeles',
  'Europe/Madrid', 'Europe/Lisbon', 'Europe/Berlin', 'Europe/Paris', 'Europe/Rome',
];

/**
 * La lista completa de zonas, solo del navegador.
 *
 * `Intl.supportedValuesOf` existe también en Node, pero **devuelve una lista
 * distinta**: Node y Chrome llevan versiones diferentes de ICU, y las zonas
 * horarias cambian con la política de cada país. Usarla en el render haría
 * que el servidor escribiera unas opciones y el navegador otras — el mismo
 * error de hidratación que rompía esta pantalla, pero más difícil de ver
 * porque solo aparecería en algunas versiones.
 *
 * En el servidor se pinta la lista corta, y el navegador la completa al
 * montarse. Lo único que se ve es que el desplegable pasa de tener 16 zonas
 * a tenerlas todas, un instante después.
 */
function zonasDelNavegador(): string[] {
  try {
    const todas = (Intl as any).supportedValuesOf?.('timeZone') as string[] | undefined;
    if (todas?.length) return todas;
  } catch {
    // Navegador sin supportedValuesOf.
  }
  return RESPALDO;
}

export function SelectorZona({
  empresaId, zona, puedeEditar,
}: {
  empresaId: string;
  zona: string;
  puedeEditar: boolean;
}) {
  const t = useTextos();
  const router = useRouter();
  const [valor, setValor] = useState(zona);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  async function cambiar(nueva: string) {
    const anterior = valor;
    setValor(nueva);
    setGuardando(true);
    setError('');
    try {
      const supabase = clienteNavegador();
      const { error: e } = await supabase.rpc('actualizar_zona', { p_empresa: empresaId, p_zona: nueva });
      if (e) throw e;
      setMensaje(t.ajustes.guardado);
      setTimeout(() => setMensaje(''), 2500);
      router.refresh();
    } catch (e: any) {
      setValor(anterior);
      setError(mensajeDeError(e, t.errores.generico));
    } finally {
      setGuardando(false);
    }
  }

  /**
   * Qué hora es ahora allá. Es la forma más rápida de darse cuenta de que la
   * zona está mal puesta.
   *
   * SE CALCULA SOLO EN EL NAVEGADOR, y no durante el render. Al hacerlo en el
   * render, el servidor escribía «04:24 p. m.» (con el idioma de Node) y el
   * navegador «16:24» (con el del sistema de la persona), React veía dos
   * textos distintos para el mismo lugar y tiraba el error de hidratación que
   * rompía la pantalla entera de Ajustes.
   *
   * Cualquier cosa que dependa de la hora actual o del idioma del sistema
   * tiene el mismo problema: nunca puede salir del render del servidor.
   */
  const [ahora, setAhora] = useState('');

  // Arranca con la lista corta —la misma que pinta el servidor— y se completa
  // al montarse en el navegador. Así los dos renders coinciden.
  const [listaZonas, setListaZonas] = useState<string[]>(RESPALDO);
  useEffect(() => { setListaZonas(zonasDelNavegador()); }, []);

  useEffect(() => {
    function actualizar() {
      try {
        setAhora(new Intl.DateTimeFormat(undefined, {
          timeZone: valor, hour: '2-digit', minute: '2-digit',
        }).format(new Date()));
      } catch {
        setAhora('');
      }
    }

    actualizar();
    // Se refresca cada medio minuto: si alguien deja Ajustes abierto, el
    // reloj no se queda clavado en la hora de cuando entró.
    const reloj = setInterval(actualizar, 30_000);
    return () => clearInterval(reloj);
  }, [valor]);

  return (
    <div>
      <label className="block">
        <span className="etiqueta">{t.ajustes.zona}</span>
        <select
          className="campo"
          value={valor}
          disabled={!puedeEditar || guardando}
          onChange={(e) => cambiar(e.target.value)}
        >
          {(listaZonas.includes(valor) ? listaZonas : [valor, ...listaZonas])
            .map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
        </select>
      </label>

      <p className="mt-2 text-[12.5px] leading-relaxed text-tinta/45">
        {t.ajustes.zonaDetalle}
        {ahora && <> · <span className="font-semibold tabular-nums">{ahora}</span></>}
      </p>

      {mensaje && <p className="mt-2 text-[13px] font-semibold text-verde-fuerte">{mensaje}</p>}
      {error && <p className="mt-2 rounded-xl bg-rojo-claro px-3 py-2 text-[13px] font-medium text-rojo">{error}</p>}
    </div>
  );
}
