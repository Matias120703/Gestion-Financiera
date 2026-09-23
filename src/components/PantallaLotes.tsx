'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { mensajeDeError } from '@/lib/errores';
import { dinero, type Vista } from '@/lib/formato';
import { useIdioma, useLocale, useTextos } from '@/i18n/cliente';
import { Seccion, Vacio } from '@/components/Piezas';
import { MensajeListo } from '@/components/rutinas/panel/Piezas';
import { FormularioCampana, type ModoCampana } from '@/components/campanas/FormularioCampana';
import { TarjetaCampana } from '@/components/campanas/TarjetaCampana';
import { cultivoVisible, kilos } from '@/components/campanas/utiles';
import type { CuentaParaElegir, Lote, MovimientoSuelto } from '@/lib/tipos';

/**
 * LOTES · la plata ordenada por ciclo y no por día. Para el agricultor,
 * CAMPAÑAS (la jerga pone la palabra; esta pantalla es la misma).
 *
 * Lo que esta pantalla NO carga es plata suelta. Los gastos se cargan en
 * Gastos y las ventas en Vender, como siempre; acá se dice a qué ciclo
 * pertenece cada cosa y se mira cómo viene. Meter otra puerta de carga
 * sería tener dos lugares donde anotar el mismo gasto, y a la semana nadie
 * sabe cuál es el bueno.
 *
 * Lo que SÍ se carga acá es lo que no es un gasto ni una venta de mostrador
 * (100): los kilos de cada camión (la cosecha) y el papel de la cooperativa
 * (la liquidación), que es una venta con sus descuentos, sus deudas
 * compensadas y su neto, todo junto. Esas dos cosas solo tienen sentido
 * dentro de una campaña.
 *
 * El número grande es el resultado del ciclo, y arranca en rojo. Es correcto
 * que arranque en rojo: durante siete meses pusiste plata y todavía no
 * vendiste. Un lote que mostrara cero mientras acumula gastos estaría
 * mintiendo.
 */
export function PantallaLotes({
  empresaId, moneda, vista, esAdmin, userId, agricola, hoy, lotes, sueltos, cuentas, abrirNueva = false,
}: {
  empresaId: string;
  /** La moneda de los datos: los formularios escriben en esta. */
  moneda: string;
  /** Cómo mira el negocio (051): la otra moneda va en gris al lado. */
  vista: Vista;
  esAdmin: boolean;
  userId: string;
  /** La ficha agrícola (jerga «agricultura»): cultivo, hectáreas, cosecha, liquidación. */
  agricola: boolean;
  hoy: string;
  lotes: Lote[];
  sueltos: MovimientoSuelto[];
  /** Para la liquidación: a qué cuenta entró el neto. Vacía si no administra. */
  cuentas: CuentaParaElegir[];
  /** Llegó con «?nueva=1» (el botón del panel): el formulario de abrir una, ya abierto. Solo administración. */
  abrirNueva?: boolean;
}) {
  const t = useTextos();
  const locale = useLocale();
  const idioma = useIdioma() === 'pt' ? 'pt' : 'es';
  const router = useRouter();
  const [trabajando, setTrabajando] = useState('');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [formulario, setFormulario] = useState<{ modo: ModoCampana; lote: Lote | null } | null>(
    () => (abrirNueva && esAdmin ? { modo: 'nuevo', lote: null } : null),
  );

  // El «?nueva=1» ya hizo lo suyo: se saca de la barra para que recargar la
  // página no vuelva a abrir el formulario.
  useEffect(() => {
    if (abrirNueva) window.history.replaceState(null, '', window.location.pathname);
  }, [abrirNueva]);

  const ocupado = trabajando !== '';

  // El «Listo» de arriba se va solo: es para enterarse, no para leerlo dos veces.
  useEffect(() => {
    if (!aviso) return;
    const reloj = setTimeout(() => setAviso(''), 6000);
    return () => clearTimeout(reloj);
  }, [aviso]);

  async function correr(marca: string, fn: () => Promise<{ error: unknown } | void>): Promise<boolean> {
    setTrabajando(marca);
    setError('');
    setAviso('');
    try {
      const r = await fn();
      const fallo = r && typeof r === 'object' && 'error' in r ? r.error : null;
      if (fallo) throw fallo;
      router.refresh();
      return true;
    } catch (e: unknown) {
      // Los mensajes de nuestras funciones ya vienen escritos para leerse y
      // pasan tal cual. Lo que traduce esto es la jerga que sale cuando falla
      // algo que no previmos: una policy, la sesión vencida, la red. Sin esta
      // línea, al que atiende el local le llegaba «new row violates row-level
      // security policy for table turnos_reserva», y con eso no desinstala la
      // pantalla: desinstala la app.
      setError(mensajeDeError(e, t.errores.generico));
      return false;
    } finally {
      setTrabajando('');
    }
  }

  const enCurso = lotes.filter((l) => l.estado === 'abierto');
  const cerrados = lotes.filter((l) => l.estado === 'cerrado');

  // Zafra contra zafra: las cerradas del mismo lote físico, juntas. Se
  // agrupa por nombre (una fila de `lotes` es una campaña de un lote).
  const comparables = useMemo(() => {
    if (!agricola) return [];
    const grupos = new Map<string, Lote[]>();
    for (const l of cerrados) {
      const k = l.nombre.trim().toLowerCase();
      grupos.set(k, [...(grupos.get(k) ?? []), l]);
    }
    return [...grupos.values()]
      .filter((g) => g.length > 1)
      .map((g) => [...g].sort((a, b) => (a.abierto_el < b.abierto_el ? 1 : -1)));
  }, [agricola, cerrados]);

  const tarjeta = (l: Lote) => (
    <TarjetaCampana
      key={l.id}
      lote={l}
      empresaId={empresaId}
      moneda={moneda}
      vista={vista}
      esAdmin={esAdmin}
      userId={userId}
      agricola={agricola}
      hoy={hoy}
      sueltos={sueltos}
      otrosAbiertos={enCurso.filter((o) => o.id !== l.id)}
      cuentas={cuentas}
      ocupado={ocupado}
      correr={correr}
      onEditar={(x) => setFormulario({ modo: 'editar', lote: x })}
      onRepetir={(x) => setFormulario({ modo: 'repetir', lote: x })}
      onAviso={(m) => { setError(''); setAviso(m); }}
    />
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {error && (
        <p role="alert" className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">
          {error}
        </p>
      )}
      <MensajeListo texto={aviso} />

      <Seccion
        titulo={t.lotes.enCurso}
        accion={esAdmin && (
          <button type="button" className="boton-texto min-h-[44px] text-[12.5px]" disabled={ocupado}
            onClick={() => setFormulario({ modo: 'nuevo', lote: null })}>
            {t.lotes.nuevo}
          </button>
        )}
      >
        <p className="px-4 pb-3 text-[12.5px] leading-relaxed text-tinta/50">{t.lotes.detalle}</p>

        {enCurso.length === 0 ? (
          <div className="px-4 pb-4">
            <Vacio titulo={t.lotes.sinLotes} detalle={t.lotes.sinLotesDetalle} />
            {esAdmin && (
              <button type="button" className="boton-principal min-h-[48px] w-full" disabled={ocupado}
                onClick={() => setFormulario({ modo: 'nuevo', lote: null })}>
                {t.lotes.nuevo}
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-borde border-t border-borde">{enCurso.map(tarjeta)}</ul>
        )}
      </Seccion>

      {cerrados.length > 0 && (
        <Seccion titulo={t.lotes.cerrados}>
          <p className="px-4 pb-2 text-[12.5px] leading-relaxed text-tinta/50">{t.lotes.cerradosDetalle}</p>
          <ul className="divide-y divide-borde border-t border-borde">{cerrados.map(tarjeta)}</ul>
        </Seccion>
      )}

      {/* ---- zafra contra zafra: kg/ha y resultado por hectárea, lado a lado ---- */}
      {comparables.length > 0 && (
        <Seccion titulo={t.campanas.cierre.comparar}>
          <p className="px-4 pb-2 text-[12.5px] leading-relaxed text-tinta/50">{t.campanas.cierre.compararDetalle}</p>
          <div className="space-y-4 px-4 pb-4">
            {comparables.map((g) => (
              <div key={g[0].id}>
                <h3 className="mb-1.5 text-[13.5px] font-bold">{g[0].nombre}</h3>
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="text-left text-tinta/50">
                      <th className="py-1 font-semibold">{t.campanas.formulario.campana}</th>
                      <th className="py-1 text-right font-semibold">{t.campanas.cierre.kgHa}</th>
                      <th className="py-1 text-right font-semibold">{t.campanas.cierre.resultadoHa}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borde/70">
                    {g.map((l) => (
                      <tr key={l.id}>
                        <td className="py-1.5 pr-2">
                          {[cultivoVisible(l.cultivo, idioma), l.campana].filter(Boolean).join(' · ')}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {l.rendimiento !== null ? kilos(l.rendimiento, locale) : ''}
                        </td>
                        <td className={`py-1.5 text-right font-semibold tabular-nums ${
                          l.resultado_ha !== null && Number(l.resultado_ha) < 0 ? 'text-rojo' : 'text-verde-fuerte'}`}>
                          {l.resultado_ha !== null ? dinero(Number(l.resultado_ha), moneda, true, locale) : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </Seccion>
      )}

      {sueltos.length > 0 && enCurso.length > 0 && (
        <p className="px-1 text-[12.5px] leading-relaxed text-tinta/45">
          {t.lotes.haySueltos(sueltos.length)}
        </p>
      )}

      {formulario && (
        <FormularioCampana
          empresaId={empresaId}
          moneda={moneda}
          hoy={hoy}
          agricola={agricola}
          modo={formulario.modo}
          lote={formulario.lote}
          lotes={lotes}
          onCerrar={() => setFormulario(null)}
          onListo={(m) => { setFormulario(null); setError(''); setAviso(m); }}
        />
      )}
    </div>
  );
}
