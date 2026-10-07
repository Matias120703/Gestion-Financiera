'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTextos } from '@/i18n/cliente';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError, verificarAfectados } from '@/lib/errores';
import type { Jerga } from '@/lib/rubros';
import { Interruptor } from '@/components/Preferencias';

/**
 * «TAMBIÉN VENDO PRODUCTOS» (121), en Ajustes › Tu negocio.
 *
 * Matías: «¿Qué pasa si un profesor de tenis vende raquetas, pelotas…? ¿Cómo
 * va a saber su ganancia de eso?». Prendido, el profe y el trainer tienen
 * Productos (con costo, precio y stock) y Vender; el panel y los reportes
 * muestran aparte lo de las clases y lo de los productos. Apagado, la cuenta
 * queda como siempre.
 *
 * Qué pantallas prende no se decide acá: lo dice la ficha del rubro
 * (`interruptores.vendeProductos`, src/lib/rubros.ts). Esto solo guarda si
 * está prendido, con un update directo a `empresas` igual que el nombre y la
 * moneda: lo escribe la administración y nadie más (la policy lo decide, y
 * `verificarAfectados` dice la verdad si no se guardó).
 *
 * Apagarlo no borra nada: los productos, el stock y las ventas quedan en la
 * base, y vuelven tal cual al prenderlo de nuevo.
 */
export function VendoProductos({
  empresaId, encendido: inicial, jerga, hayProductos = false,
}: {
  empresaId: string;
  encendido: boolean;
  /** Para los ejemplos y las palabras: el trainer vende proteína, no raquetas. */
  jerga: Jerga | null;
  /** Si ya cargó alguno: el botón dice «Mis productos» en vez de «Cargar mi primer producto». */
  hayProductos?: boolean;
}) {
  const t = useTextos();
  const router = useRouter();
  const va = t.vendoProductos.ajustes;
  const trainer = jerga === 'entrenamiento';
  const p = trainer ? t.reportesAlumnos.palabras.trainer : t.reportesAlumnos.palabras.profe;

  const [encendido, setEncendido] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  /** Lo que se le dice después de tocarlo: qué cambió en su menú. */
  const [aviso, setAviso] = useState<'prendido' | 'apagado' | null>(null);

  async function cambiar(valor: boolean) {
    if (guardando) return;
    // Se mueve al toque; si la base no lo guarda, vuelve atrás y se dice.
    setEncendido(valor);
    setGuardando(true);
    setError('');
    setAviso(null);
    try {
      const { data, error: e } = await clienteNavegador()
        .from('empresas')
        .update({ vende_productos: valor })
        .eq('id', empresaId)
        .select('id');
      if (e) throw e;
      verificarAfectados(data, t.ajustes.soloAdminDatos);
      setAviso(valor ? 'prendido' : 'apagado');
      // El menú se arma en el layout, en el servidor: así aparecen (o se van)
      // Productos, Vender y el Cierre del día (128) sin recargar la página.
      router.refresh();
    } catch (err: any) {
      setEncendido(!valor);
      setError(mensajeDeError(err, t.gastos.noSePudoGuardar));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-3">
      <Interruptor
        titulo={va.titulo}
        detalle={va.detalle(trainer ? va.ejemplos.trainer : va.ejemplos.profe, p)}
        encendido={encendido}
        alCambiar={cambiar}
        deshabilitado={guardando}
      />

      {error && (
        <p role="alert" className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>
      )}

      {aviso === 'prendido' && (
        <p role="status" className="rounded-xl bg-verde-claro px-3 py-2.5 text-[13px] font-semibold text-verde-fuerte">
          ✓ {va.prendido}
        </p>
      )}

      {aviso === 'apagado' && (
        <p role="status" className="rounded-xl bg-arena px-3.5 py-3 text-[13px] leading-relaxed text-tinta/60">
          {va.apagado}
        </p>
      )}

      {encendido && !guardando && (
        <div className="flex flex-wrap gap-2">
          <Link href="/productos" className="boton-principal shrink-0 px-5 py-2.5 text-[14px]">
            {hayProductos ? t.vendoProductos.panel.verProductos : va.cargarPrimero}
          </Link>
          <Link href="/vender" className="boton-suave shrink-0 px-5 py-2.5 text-[14px]">
            {va.irAVender}
          </Link>
        </div>
      )}
    </div>
  );
}
