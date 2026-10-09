'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { dinero, fechaLegible } from '@/lib/formato';
import { hoyISO } from '@/lib/fechas';
import { tipoDeBien, valorViejo } from '@/lib/patrimonio';
import { useLocale, useTextos } from '@/i18n/cliente';
import { useZona } from '@/lib/zona';
import type { Bien, Billetera, Patrimonio, TipoBien } from '@/lib/tipos';
import { Hoja, MensajeError, PieHoja } from '@/components/Hoja';
import { Seccion } from '@/components/Piezas';
import { HojaBien, type QueHacerConUnBien } from '@/components/billetera/HojaBien';
import { TarjetaTengoEnTotal } from '@/components/billetera/TarjetaTengoEnTotal';

const trazo = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

/** Un dibujo por tipo, con el trazo de siempre: se reconoce de un vistazo sin leer. */
const DIBUJO: Record<TipoBien, React.ReactNode> = {
  vehiculo: (
    <>
      <path d="M4 16.5v-3.3l1.7-4.5a2 2 0 0 1 1.9-1.3h8.8a2 2 0 0 1 1.9 1.3l1.7 4.5v3.3Z" />
      <path d="M4.4 12.6h15.2M6.6 16.5v1.7M17.4 16.5v1.7M7.6 14.6h.01M16.4 14.6h.01" />
    </>
  ),
  terreno: (
    <>
      <path d="M3.5 18.5h17M5 18.5l4.4-6.8 3.2 4.1 2.4-3.1 4 5.8" />
      <circle cx="16.4" cy="7.4" r="1.7" />
    </>
  ),
  casa: <path d="M4.5 11 12 4.8l7.5 6.2M6.5 9.6v8.9h11V9.6M10.3 18.5v-4.7h3.4v4.7" />,
  maquina: (
    <>
      <circle cx="8" cy="15.5" r="3.4" /><circle cx="17.6" cy="16.9" r="2" />
      <path d="M11.4 15.5h4.3M5.6 12.3V7.5h5.6l1.6 4.2h4.6a1.6 1.6 0 0 1 1.6 1.6v1.7M8.6 7.5V5.3" />
    </>
  ),
  animales: (
    <>
      <path d="M7.6 8.6C6 8.6 4.6 7.7 4 6.2c1.4-.5 2.8-.2 3.9.7M16.4 8.6c1.6 0 3-.9 3.6-2.4-1.4-.5-2.8-.2-3.9.7" />
      <path d="M7.6 8.4c1-1.4 2.6-2.2 4.4-2.2s3.4.8 4.4 2.2c.7 1 .9 2.2.7 3.5l-.7 3.7c-.4 2-2.2 3.4-4.4 3.4s-4-1.4-4.4-3.4l-.7-3.7c-.2-1.3 0-2.5.7-3.5Z" />
      <path d="M10 11.6h.01M14 11.6h.01M10.6 15.8h2.8" />
    </>
  ),
  otro: (
    <>
      <path d="M12 3.8 19.5 8v8L12 20.2 4.5 16V8Z" />
      <path d="M4.5 8 12 12.2 19.5 8M12 12.2v8" />
    </>
  ),
};

/**
 * «LO QUE TENÉS» (132), adentro de la Billetera y debajo de las cuentas.
 *
 * Matías: «También tiene que ver lo que sería patrimonios; por ejemplo, un
 * auto, un terreno, lo que sea». Quiere anotar lo que tiene y no es plata,
 * con su valor, y ver cuánto tiene en total.
 *
 * UN BIEN ES UNA ANOTACIÓN CON UN VALOR. Desde acá se anota, se le cambia el
 * nombre, se le actualiza el valor y se saca de la lista: cuatro llamadas a
 * la base, y NINGUNA mueve una cuenta, crea un movimiento ni toca la
 * ganancia. Por eso, al vender algo, no se pregunta por cuánto: se recuerda
 * que la plata que entró se anota donde siempre, en la cuenta.
 *
 * QUIEN NO ANOTÓ NADA VE LA BILLETERA DE SIEMPRE, con una sola cosa nueva: el
 * botón suave para anotar algo. La lista y la tarjeta «Tengo en total»
 * aparecen recién con el primer bien.
 *
 * Cada valor se escribe con SU moneda. Nada se suma acá: el único número que
 * junta monedas es el de la tarjeta, con «≈» y su cotización a la vista.
 */
export function BloqueBienes({
  empresaId, moneda, billetera, patrimonio, conMercaderia, oculto,
}: {
  empresaId: string;
  /** La moneda del negocio. */
  moneda: string;
  billetera: Billetera;
  patrimonio: Patrimonio;
  conMercaderia: boolean;
  /** El ojo de la Billetera: tapa también estos números. */
  oculto: boolean;
}) {
  const t = useTextos();
  const p = t.monedas.patrimonio;
  const locale = useLocale();
  const zona = useZona();
  const router = useRouter();
  const bienes = patrimonio.bienes;
  const hoy = hoyISO(zona);

  const [abierto, setAbierto] = useState<string | null>(null);
  const [hoja, setHoja] = useState<QueHacerConUnBien | null>(null);
  const [aQuitar, setAQuitar] = useState<Bien | null>(null);
  const [quitando, setQuitando] = useState(false);
  const [error, setError] = useState('');
  /** Se acaba de marcar algo como vendido: se recuerda dónde va la plata. */
  const [vendido, setVendido] = useState(false);
  const enCurso = useRef(false);
  const aviso = useRef<HTMLDivElement>(null);

  // El aviso de «Lo vendí» va arriba de la lista: con varias cosas anotadas
  // quedaba fuera de la pantalla y no se veía. Se lo trae a la vista.
  useEffect(() => {
    if (!vendido) return;
    const quieto = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    aviso.current?.scrollIntoView({ block: 'center', behavior: quieto ? 'auto' : 'smooth' });
  }, [vendido]);

  const plata = (n: number, enMoneda: string) => (oculto ? '••••••' : dinero(n, enMoneda, true, locale));

  async function quitar(motivo: 'vendido' | 'quitado') {
    if (!aQuitar || enCurso.current) return;
    enCurso.current = true;
    setQuitando(true);
    setError('');
    try {
      const { error: fallo } = await clienteNavegador().rpc('quitar_bien', {
        p_empresa: empresaId, p_id: aQuitar.id, p_motivo: motivo,
      });
      if (fallo) throw fallo;
      router.refresh();
      setAQuitar(null);
      setAbierto(null);
      setVendido(motivo === 'vendido');
    } catch (fallo) {
      setError(mensajeDeError(fallo, t.errores.generico));
      // «Eso ya no está en tu lista.» (se sacó desde otro teléfono): la lista de atrás se pone al día.
      if ((fallo as { code?: string } | null)?.code === 'P0002') router.refresh();
    } finally {
      enCurso.current = false;
      setQuitando(false);
    }
  }

  const irAMisCuentas = () => {
    setVendido(false);
    const quieto = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: quieto ? 'auto' : 'smooth' });
  };

  const abrirNuevo = () => { setVendido(false); setHoja({ modo: 'nuevo' }); };

  return (
    <>
      {/* Después de «Lo vendí»: Orden no anota esa plata sola. */}
      {vendido && (
        <div ref={aviso} role="status" className="rounded-2xl border border-borde/70 bg-superficie px-4 pb-1.5 pt-3">
          <p className="text-[13px] leading-snug text-tinta/75">{p.siEntroPlata}</p>
          <button type="button" onClick={irAMisCuentas} className="boton-texto min-h-[40px] text-[13px]">
            {p.irAMisCuentas}
          </button>
        </div>
      )}

      {bienes.length === 0 ? (
        <div>
          <button type="button" onClick={abrirNuevo} className="boton-suave w-full py-3 text-[14px]">
            {p.agregarUnBien}
          </button>
          <p className="mt-2 px-2 text-center text-[12.5px] leading-snug text-tinta/50">{p.vacioDetalle}</p>
        </div>
      ) : (
        <Seccion
          titulo={p.loQueTenes}
          accion={(
            <button type="button" onClick={abrirNuevo} className="boton-texto min-h-[36px]">
              + {p.agregar}
            </button>
          )}
        >
          <ul className="px-2 pb-2">
            {bienes.map((b) => {
              const tipo = tipoDeBien(b.tipo);
              const esteAbierto = abierto === b.id;
              return (
                <li key={b.id} className={`rounded-2xl transition ${esteAbierto ? 'bg-arena' : ''}`}>
                  <button
                    type="button" aria-expanded={esteAbierto}
                    onClick={() => setAbierto(esteAbierto ? null : b.id)}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-arena"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-verde-claro text-verde-fuerte">
                      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden {...trazo}>{DIBUJO[tipo]}</svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        {/* El nombre es lo que la persona escribió: hasta dos
                            renglones antes de cortarlo, y abierta se lee entero. */}
                        <span className={`min-w-0 break-words text-[15px] font-semibold leading-snug ${esteAbierto ? '' : 'line-clamp-2'}`}>{b.nombre}</span>
                        <span className="shrink-0 text-[15px] font-semibold tabular-nums">{plata(b.valor, b.moneda)}</span>
                      </span>
                      <span className="block truncate text-[12.5px] text-tinta/50">
                        {p.tipos[tipo] ?? tipo}
                        {' · '}
                        {/* Una estimación de hace más de un año: la fecha, en ámbar. */}
                        <span className={valorViejo(b.valor_al, hoy) ? 'font-semibold text-ambar' : ''}>
                          {p.valorDel(fechaLegible(b.valor_al, valorViejo(b.valor_al, hoy), locale))}
                        </span>
                      </span>
                    </span>
                    <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 text-tinta/30 transition ${esteAbierto ? 'rotate-90' : ''}`} aria-hidden {...trazo} strokeWidth={2}>
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </button>

                  {esteAbierto && (
                    <div className="px-3 pb-3 pt-1">
                      {b.nota && <p className="text-[12.5px] leading-snug text-tinta/60">{b.nota}</p>}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" className="boton-principal px-4 py-2 text-[13px]"
                          onClick={() => setHoja({ modo: 'valor', bien: b })}>
                          {p.actualizarValor}
                        </button>
                        <button type="button" className="boton-suave px-4 py-2 text-[13px]"
                          onClick={() => setHoja({ modo: 'editar', bien: b })}>
                          {t.billetera.editar}
                        </button>
                        <button type="button" className="boton-suave px-4 py-2 text-[13px]"
                          onClick={() => { setError(''); setAQuitar(b); }}>
                          {p.yaNoLoTengo}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Seccion>
      )}

      {/* Recién con algo anotado: antes, la Billetera es la de siempre. */}
      {bienes.length > 0 && (
        <TarjetaTengoEnTotal
          empresaId={empresaId} moneda={moneda} billetera={billetera} patrimonio={patrimonio}
          conMercaderia={conMercaderia} oculto={oculto}
        />
      )}

      {hoja && (
        <HojaBien empresaId={empresaId} moneda={moneda} que={hoja} onCerrar={() => setHoja(null)} />
      )}

      {/* Dos salidas y ninguna es «cancelar»: por eso no es `Confirmar`, donde
          cerrar con la ✕ o tocando afuera es lo mismo que su segundo botón.
          Acá cerrar no saca nada de la lista. */}
      {aQuitar && (
        <Hoja
          titulo={p.yaNoLoTengo}
          subtitulo={`${aQuitar.nombre} · ${plata(aQuitar.valor, aQuitar.moneda)}`}
          onCerrar={() => { setAQuitar(null); setError(''); }}
          bloqueada={quitando} tamano="chico"
          pie={(
            <PieHoja columnas={2}>
              <button type="button" className="boton-suave min-h-[48px] px-3" disabled={quitando} onClick={() => quitar('quitado')}>
                {p.sacarDeLaLista}
              </button>
              <button type="button" className="boton-principal min-h-[48px] px-3" disabled={quitando} onClick={() => quitar('vendido')}>
                {p.loVendi}
              </button>
            </PieHoja>
          )}
        >
          <MensajeError texto={error} />
        </Hoja>
      )}
    </>
  );
}
