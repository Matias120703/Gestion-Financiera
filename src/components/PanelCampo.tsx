import Link from 'next/link';
import {
  type Moneda, dinero, numero, fechaLegible, precio, convertido, vistaDe,
} from '@/lib/formato';
import { Vacio } from '@/components/Piezas';
import { BilleteraPanel } from '@/components/BilleteraPanel';
import { cultivoPorNombre, sacasPorHa, unidadDePrecio, precioEnUnidad } from '@/lib/agricultura';
import { cultivoVisible } from '@/components/campanas/utiles';
import type { Textos } from '@/i18n/textos/es';
import type { Billetera, Lote, ResumenDeudas, ResumenFiado } from '@/lib/tipos';

/**
 * LO QUE MIRA QUIEN VIVE DE CAMPAÑAS AL ABRIR ORDEN (100).
 *
 * El panel de siempre, con una tarjeta de lotes arriba, seguía siendo el de
 * un almacén: selector de día/semana/mes, «Ganancia neta del período» con
 * variación, «Productos que más dejaron» vacío para siempre, cobros por
 * método, stock bajo. Para el sojero que entra a probar, eso grita «esto
 * es para un kiosco». Se corta como el del profe (`PanelProfe`): una
 * pantalla propia cuando `ficha.ciclosLargos`.
 *
 * Las preguntas de alguien que vende tres veces al año son otras: ¿cómo
 * viene cada campaña?, ¿cuánto debo y cuándo vence?, ¿cuánta plata tengo?,
 * ¿quién me debe?, ¿cómo me fue en lo que ya cerré? Eso, en ese orden, y
 * nada más. Sin racha (contarle días seguidos a quien carga una vez por
 * semana es contarle su fracaso), sin rango de fechas (vive en Reportes) y
 * sin «En lo que va del año», que en septiembre suma la cosecha de abril
 * con la siembra de ahora y da un número al azar.
 *
 * TODOS LOS NÚMEROS SALEN DE LA BASE. `listar_lotes` ya trae los de
 * `numeros_de_lote` —los mismos que la tarjeta de la campaña y el Excel—
 * con los de administración en null para quien no lo es. Acá no se calcula
 * ninguno: lo que llega null no se muestra, ni siquiera con un guion.
 *
 * El ganadero entra por acá igual, con las palabras neutras del
 * diccionario («Lotes en curso»); lo agrícola (kilos, sacas, silo) solo
 * aparece cuando el lote tiene hectáreas o cosechas.
 */
export function PanelCampo({
  lotes, deudas, billetera, fiado, moneda, monedaPropia, esAdmin, hoy, locale, idioma, t,
}: {
  /** Todos: abiertos y cerrados (los cerrados alimentan «Cerrados este año» y el total a cosecha). */
  lotes: Lote[];
  /** Solo administración; null si no lo es o si no se pudo leer. */
  deudas: ResumenDeudas | null;
  /** Solo administración; null si no lo es o si no se pudo leer. */
  billetera: Billetera | null;
  fiado: ResumenFiado | null;
  /** La moneda en la que se mira (051): acá solo se informa. */
  moneda: Moneda;
  /** La de los datos: define si el precio se dice por tonelada o por kilo. */
  monedaPropia: string;
  esAdmin: boolean;
  hoy: string;
  locale: string;
  /** Para decir el cultivo, que se guarda en español («Maíz» → «Milho»). */
  idioma: string;
  /** Ya con la jerga del oficio encima: «campaña», «a cosecha». */
  t: Textos;
}) {
  const pc = t.panelCampo;
  const abiertos = lotes.filter((l) => l.estado === 'abierto');
  const anio = hoy.slice(0, 4);
  const cerradosEsteAnio = lotes.filter((l) => l.estado === 'cerrado' && (l.cerrado_el ?? '').slice(0, 4) === anio);
  const resultadoCerrados = cerradosEsteAnio.reduce((s, l) => s + Number(l.resultado ?? 0), 0);
  // Lo que se debe «a cosecha» de TODAS las campañas, también las cerradas:
  // cerrar la campaña no salda la deuda con la casa de insumos.
  const aCosecha = lotes.reduce((s, l) => s + (l.a_cosecha === null ? 0 : Number(l.a_cosecha)), 0);
  const plata = (n: number) => dinero(n, moneda, true, locale);

  return (
    <>
      {/* ---------------- Las campañas en curso, arriba de todo ---------------- */}
      <section className="space-y-3" aria-labelledby="campo-en-curso">
        <div className="flex items-center justify-between gap-3">
          <h2 id="campo-en-curso" className="text-[15px] font-bold tracking-tight">{pc.enCurso}</h2>
          {abiertos.length > 0 && (
            <Link href="/lotes" className="boton-texto inline-flex min-h-[44px] items-center px-1">{pc.verTodos}</Link>
          )}
        </div>

        {abiertos.length === 0 ? (
          <div className="tarjeta">
            {/* Sin ninguna todavía, el ejemplo: «Norte · Soja · 50 ha». Con
                cerradas pero ninguna abierta, no es «la primera». */}
            <Vacio
              titulo={lotes.length === 0 ? pc.vacio : t.lotes.sinLotes}
              detalle={t.lotes.sinLotesDetalle}
            />
            {esAdmin && (
              <div className="px-4 pb-5 text-center">
                <Link href="/lotes?nueva=1" className="boton-principal inline-flex min-h-[44px] items-center px-6 text-[14.5px]">
                  {pc.abrir}
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {abiertos.map((l) => (
              <TarjetaLote
                key={l.id} l={l} moneda={moneda} monedaPropia={monedaPropia}
                esAdmin={esAdmin} locale={locale} idioma={idioma} t={t}
              />
            ))}
          </div>
        )}
      </section>

      {/* ---------------- Debés: UNA tarjeta para la misma plata ----------------
          Antes eran dos: «Lo que debés» y «A cosecha», y la segunda era un
          pedazo de la primera. Se lee junto: el total, cuánto de eso se paga
          con el grano, y cuándo vence lo próximo. */}
      {esAdmin && deudas && Number(deudas.total_debido) > 0 && (
        <Link href="/deudas" className="tarjeta block p-4 transition hover:border-verde/50">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-tinta/55">{pc.debes.titulo}</p>
              <p className="mt-0.5 font-titulo text-[22px] font-extrabold tabular-nums tracking-tight">
                {plata(Number(deudas.total_debido))}
              </p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-tinta/50">
                {[
                  aCosecha > 0 ? pc.debes.aCosecha(plata(aCosecha)) : null,
                  deudas.proximo_vencimiento
                    ? (deudas.proximo_vencimiento === hoy
                      ? pc.debes.venceHoy
                      : pc.debes.venceEl(fechaLegible(deudas.proximo_vencimiento, false, locale)))
                    : null,
                ].filter(Boolean).join(' · ')}
              </p>
            </div>
            {deudas.vencidas > 0 ? (
              <span className="pastilla shrink-0 bg-rojo-claro text-rojo">{t.panel.vencidas(deudas.vencidas)}</span>
            ) : deudas.vence_pronto > 0 ? (
              <span className="pastilla shrink-0 bg-ambar-claro text-ambar">{t.panel.vencenSemana(deudas.vence_pronto)}</span>
            ) : null}
          </div>
        </Link>
      )}

      {/* ---------------- Tu plata: el total y cada banco (074) ---------------- */}
      {billetera && <BilleteraPanel billetera={billetera} moneda={monedaPropia} />}

      {/* ---------------- Te deben: la misma tarjeta del panel de siempre ---------------- */}
      {fiado && Number(fiado.total) > 0 && (
        <Link href="/fiado" className="tarjeta block p-4 transition hover:border-verde/50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-tinta/55">{t.panel.teDeben}</p>
              <p className="mt-0.5 font-titulo text-[22px] font-extrabold tabular-nums tracking-tight">{plata(Number(fiado.total))}</p>
              <p className="mt-0.5 text-[12.5px] text-tinta/50">
                {t.panel.clientesQueDeben(fiado.cuantos)} · {t.panel.plataQueNoEntro}
              </p>
            </div>
            <span className="shrink-0 text-[13px] font-semibold text-verde-fuerte">{t.panel.verFiado}</span>
          </div>
        </Link>
      )}

      {/* ---------------- Lo que ya cerró este año ----------------
          En vez de «En lo que va del año»: la unidad del campo es la
          campaña, y lo que se puede decir del año es cómo terminaron las
          que ya terminaron. Es de caja, como el resultado de cada tarjeta. */}
      {cerradosEsteAnio.length > 0 && (
        <Link href="/lotes" className="tarjeta block p-4 transition hover:border-verde/50">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-tinta/55">{pc.cerradasEsteAnio}</p>
              <p className="mt-0.5 text-[12.5px] text-tinta/50">{pc.cerradasDetalle(cerradosEsteAnio.length)}</p>
            </div>
            <p className={`font-titulo text-[22px] font-extrabold tabular-nums tracking-tight ${
              resultadoCerrados >= 0 ? 'text-verde-fuerte' : 'text-rojo'
            }`}>
              {plata(resultadoCerrados)}
            </p>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-tinta/45">{pc.esDeCaja}</p>
        </Link>
      )}
    </>
  );
}

/**
 * La tarjeta compacta de una campaña, en el orden en que la mira el
 * productor: cuánto le cuesta por hectárea, cómo viene el resultado,
 * cuántos kilos necesita para cubrir, cuánto cosechó y cuánto le queda en
 * el silo. El detalle entero (tickets, liquidaciones, estructura) está en
 * la campaña; esto es para abrir la app y saber cómo viene.
 */
function TarjetaLote({
  l, moneda, monedaPropia, esAdmin, locale, idioma, t,
}: {
  l: Lote;
  moneda: Moneda;
  monedaPropia: string;
  esAdmin: boolean;
  locale: string;
  idioma: string;
  t: Textos;
}) {
  const tj = t.panelCampo.tarjeta;
  const plata = (n: number) => dinero(n, moneda, true, locale);
  const kilos = (n: number) => numero(Math.round(n), locale);
  // El precio sin «,00» cuando es redondo: «US$ 415/t» se lee, «US$ 415,00/t»
  // parece una planilla. Convertido a la moneda que se mira, como todo.
  const unidad = unidadDePrecio(monedaPropia);
  const precioVisible = (porTonelada: number) => {
    const texto = precio(convertido(precioEnUnidad(porTonelada, unidad), moneda), vistaDe(moneda).moneda, locale);
    return unidad === 'kg' ? tj.porKilo(texto) : tj.porTonelada(texto);
  };

  const hectareas = l.hectareas === null ? null : Number(l.hectareas);
  const conHa = hectareas !== null && hectareas > 0;
  const cultivo = cultivoPorNombre(l.cultivo);
  const sacas = (kgHa: number) => (cultivo.sacas ? ` · ${tj.sacas(numero(sacasPorHa(kgHa), locale))}` : '');

  // «Norte · Soja · 50 ha»; el ganadero: «Novillos corral 3 · 40 cabezas».
  // El cultivo se guarda en español y se dice en el idioma de quien mira.
  const cantidad = Number(l.cantidad);
  const titulo = [
    l.nombre,
    cultivoVisible(l.cultivo, idioma) || null,
    conHa ? tj.ha(numero(hectareas as number, locale)) : (l.unidad && cantidad > 0 ? `${numero(cantidad, locale)} ${l.unidad}` : null),
  ].filter(Boolean).join(' · ');
  const subtitulo = [l.campana || null, tj.llevaDias(Number(l.dias))].filter(Boolean).join(' · ');

  const costo = l.costo === null ? null : Number(l.costo);
  const resultado = Number(l.resultado ?? 0);
  const kgCosechados = Number(l.kg_cosechados ?? 0);
  const kgSinVender = Number(l.kg_sin_vender ?? 0);
  const vacia = Number(l.movimientos ?? 0) === 0 && kgCosechados === 0 && !(Number(l.a_cosecha ?? 0) > 0);

  // Los renglones de kilos: el ganadero no tiene ninguno, y sin ninguno
  // no se dibuja ni la raya que los separa.
  const verParaCubrir = l.kg_ha_para_cubrir !== null && l.precio_ref !== null;
  const verSinPrecio = esAdmin && conHa && costo !== null && costo > 0 && l.precio_ref === null;
  const hayKilos = verParaCubrir || verSinPrecio || kgCosechados > 0 || kgSinVender !== 0;

  const resultadoDetalle = l.resultado_ha !== null
    ? tj.porHa(plata(Number(l.resultado_ha)))
    : (l.por_unidad !== null && l.unidad ? t.lotes.porUnidad(plata(Number(l.por_unidad)), l.unidad) : null);

  return (
    <Link href="/lotes" className="tarjeta block p-4 transition hover:border-verde/50">
      <p className="truncate text-[16px] font-bold tracking-tight">{titulo}</p>
      <p className="mt-0.5 truncate text-[12.5px] text-tinta/50">{subtitulo}</p>

      {vacia ? (
        <p className="mt-3 text-[13.5px] text-tinta/55">{tj.sinNada}</p>
      ) : (
        <>
          <dl className="mt-3 space-y-2.5">
            {/* El costo es de administración (015): para el peón llega null
                y el renglón no existe. */}
            {costo !== null && (
              <Renglon
                etiqueta={tj.costo}
                valor={plata(costo)}
                detalle={l.costo_ha !== null ? tj.porHa(plata(Number(l.costo_ha))) : null}
              />
            )}
            <Renglon
              etiqueta={tj.resultado}
              valor={plata(resultado)}
              detalle={resultadoDetalle}
              tono={resultado >= 0 ? 'bueno' : 'malo'}
            />
          </dl>

          {hayKilos && (
          <ul className="mt-3 space-y-1.5 border-t border-borde pt-3 text-[13px] leading-snug text-tinta/70">
            {/* El punto de equilibrio, desde el primer gasto: es el número
                que el productor compara con «los 3.000 kilos» de la radio. */}
            {verParaCubrir && (
              <li>
                {tj.paraCubrir(kilos(Number(l.kg_ha_para_cubrir)), precioVisible(Number(l.precio_ref)))}
                {sacas(Number(l.kg_ha_para_cubrir))}
                {costo !== null && costo > 0 && l.falta_cubrir !== null && Number(l.falta_cubrir) === 0 && (
                  <span className="pastilla ml-1.5 bg-verde-claro text-verde-fuerte">{tj.cubierto}</span>
                )}
              </li>
            )}
            {verSinPrecio && (
              <li className="text-tinta/50">{tj.sinPrecio}</li>
            )}
            {kgCosechados > 0 && (
              <li>
                {tj.cosechado(kilos(kgCosechados))}
                {l.rendimiento !== null && (
                  <> · {tj.kgHa(kilos(Number(l.rendimiento)))}{sacas(Number(l.rendimiento))}</>
                )}
              </li>
            )}
            {kgSinVender > 0 && <li className="font-semibold text-tinta">{tj.enElSilo(kilos(kgSinVender))}</li>}
            {kgSinVender < 0 && <li className="font-semibold text-ambar">{tj.vendisteMas}</li>}
          </ul>
          )}
        </>
      )}
    </Link>
  );
}

function Renglon({
  etiqueta, valor, detalle, tono = 'neutro',
}: {
  etiqueta: string;
  valor: string;
  detalle?: string | null;
  tono?: 'neutro' | 'bueno' | 'malo';
}) {
  const color = tono === 'bueno' ? 'text-verde-fuerte' : tono === 'malo' ? 'text-rojo' : 'text-tinta';
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[13.5px] text-tinta/60">{etiqueta}</dt>
      <dd className="min-w-0 text-right">
        <span className={`block font-titulo text-[18px] font-extrabold tabular-nums tracking-tight ${color}`}>{valor}</span>
        {detalle && <span className="block text-[12px] tabular-nums text-tinta/50">{detalle}</span>}
      </dd>
    </div>
  );
}
