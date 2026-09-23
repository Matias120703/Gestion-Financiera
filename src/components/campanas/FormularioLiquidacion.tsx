'use client';

import { useState } from 'react';
import { flushSync } from 'react-dom';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { useIdioma, useLocale, useTextos } from '@/i18n/cliente';
import {
  RETENCION_IVA, avisoDolar, avisoPrecio, cambioDesde, convertir, cultivoPorNombre, otraMoneda,
  precioPorTonelada, retencionSugerida, unidadDePrecio,
} from '@/lib/agricultura';
import {
  brutoDe, brutoDelPapel, repartirLiquidacion, toparCompensaciones, type Papel,
} from '@/lib/liquidacion';
import { dinero, decimalesDe, simboloDe, type Vista } from '@/lib/formato';
import { CampoMonto } from '@/components/CampoMonto';
import { FormaDeCobro, cuentaDelCobro } from '@/components/FormaDeCobro';
import { Hoja, MensajeError } from '@/components/rutinas/panel/Piezas';
import { useAccion } from '@/components/rutinas/panel/useAccion';
import type {
  CuentaParaElegir, DeudaDeLote, Lote, LoteDetalle, RespuestaLiquidacion,
} from '@/lib/tipos';
import {
  categoriaDeCampana, kilos, nombreLargo, precioDicho, unidadDelPrecio,
} from './utiles';

/**
 * Los descuentos que trae un papel de la cooperativa, con el nombre de la
 * categoría de gasto que crean (101). «Regalías» no es una categoría: va
 * en «Otros». Sin porcentaje automático: cada silo aplica el suyo, y la
 * retención solo se SUGIERE con un botón.
 */
const CATEGORIAS_DESCUENTO = ['Secado y acopio', 'Fletes', 'Retención de IVA', 'Intereses y bancos', 'Otros'];
/** Lo que se suele pagar entregando grano: el alquiler en kilos, o el insumo. */
const CATEGORIAS_GRANO = ['Arrendamiento', 'Semilla', 'Fertilizante', 'Agroquímicos', 'Otros'];
/** El tope de la base por campaña. */
const MAX_DESCUENTOS = 12;

interface Fila { id: number; categoria: string; monto: number; descripcion: string }

function redondear4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

/**
 * CARGAR LA LIQUIDACIÓN (flujo D, con el papel en la mano).
 *
 * Se copia el papel de arriba abajo: fecha, quién compró, de dónde eran los
 * kilos, el precio, lo que el silo se quedó, y el neto que acreditó. La
 * cooperativa liquida por SOCIO: un solo papel puede juntar kilos de dos
 * campañas, y acá se suman con un toque (los kilos sugeridos son los que
 * cada una tiene sin vender).
 *
 * El precio va en la unidad de la moneda (US$/t el sojero, Gs/kg el
 * sesamero). Si pagaron en la otra moneda, «Me pagaron en…» pide el cambio
 * y TODO lo del papel (precio y descuentos) se escribe como viene; lo que
 * se guarda ya va convertido. Las deudas se escriben en la moneda propia,
 * que es en la que están.
 *
 * El reparto entre campañas lo hace `src/lib/liquidacion.ts`, siempre en
 * el mismo orden: `toparCompensaciones` (el año seco: si lo compensado
 * supera el bruto, se baja y lo que falta sigue como deuda) →
 * `repartirLiquidacion` → `p_partes`. Nada de eso se decide acá.
 *
 * El id del papel (`p_grupo`) se genera UNA vez al abrir la hoja: un
 * reintento sin señal no lo carga dos veces.
 *
 * CANJE («Entregué kilos para pagar»): la misma hoja, sin plata. Todo el
 * bruto que no se llevaron las deudas marcadas va a «lo que pagó el grano»
 * (el alquiler, el insumo) y el neto es cero, sin cuenta.
 */
export function FormularioLiquidacion({
  empresaId, moneda, vista, lote, deudas, destinos, otrosLotes, cuentas, hoy, canje, onCerrar, onListo,
}: {
  empresaId: string;
  /** La moneda de los DATOS. */
  moneda: string;
  /** Para precargar el dólar con el que ya mira la otra moneda. */
  vista: Vista;
  lote: Lote;
  /** Las deudas a cosecha de esta campaña (resumen_lote). */
  deudas: DeudaDeLote[];
  /** Compradores y destinos ya usados, para elegir a un toque. */
  destinos: string[];
  /** Las otras campañas abiertas, por si el papel junta kilos de más de una. */
  otrosLotes: Lote[];
  cuentas: CuentaParaElegir[];
  hoy: string;
  canje: boolean;
  onCerrar: () => void;
  onListo: (mensaje: string) => void;
}) {
  const t = useTextos();
  const l = t.campanas.liquidacion;
  const locale = useLocale();
  const idioma = useIdioma() === 'pt' ? 'pt' : 'es';
  const { ocupado, error, setError, correr } = useAccion();

  const [grupo] = useState(() => crypto.randomUUID());
  const [fecha, setFecha] = useState(hoy);
  const [comprador, setComprador] = useState('');
  const [partes, setPartes] = useState<{ lote: Lote; kg: number }[]>(
    () => [{ lote, kg: Math.max(0, Math.round(Number(lote.kg_sin_vender) || 0)) }],
  );
  const [deudasPorLote, setDeudasPorLote] = useState<Record<string, DeudaDeLote[]>>({ [lote.id]: deudas });
  const [precio, setPrecio] = useState(0);
  const otra = otraMoneda(moneda);
  const [enOtra, setEnOtra] = useState(false);
  // El dólar con el que ya mira la otra moneda, si lo cargó (051). La
  // cotización es cuánto vale 1 de la moneda propia en la otra: un negocio
  // en dólares que mira en guaraníes guarda 1/6000, y ahí se da vuelta para
  // escribirlo como «guaraníes por dólar». Solo esa pareja se invierte: en
  // cualquier otra (un negocio en reales que mira en guaraníes) el número ya
  // es el cambio que espera `cambioDesde`. Igual que `dolarDeLaVista` en
  // gastos/page.tsx.
  const [dolar, setDolar] = useState<number>(() => {
    const cot = Number(vista.cotizacion);
    if (vista.moneda !== otra || !(cot > 0)) return 0;
    return moneda === 'USD' && otra === 'PYG' ? Math.round(1 / cot) : cot;
  });
  const [descuentos, setDescuentos] = useState<Fila[]>([]);
  const [marcadas, setMarcadas] = useState<Record<string, number>>({});
  const [grano, setGrano] = useState<Fila[]>([]);
  const [canjeCategoria, setCanjeCategoria] = useState('Arrendamiento');
  const [canjeDescripcion, setCanjeDescripcion] = useState('');
  const [silo, setSilo] = useState(canje);
  const [metodo, setMetodo] = useState('transferencia');
  const [cuentaElegida, setCuentaElegida] = useState<string | null>(null);
  const [notas, setNotas] = useState('');
  const [siguiente, setSiguiente] = useState(1);

  const plata = (n: number, m: string = moneda) => dinero(n, m, true, locale);

  // ---- la moneda del papel ----
  const monedaPapel = enOtra ? otra : moneda;
  const unidad = unidadDePrecio(monedaPapel);
  const parDolar = (moneda === 'PYG' && otra === 'USD') || (moneda === 'USD' && otra === 'PYG');
  const cambio = enOtra && dolar > 0 ? cambioDesde(moneda, otra, dolar) : 1;
  const avisoD = enOtra && parDolar && dolar > 0 ? avisoDolar(dolar) : 'ok';
  /** Un monto escrito en la moneda del papel, en la propia. */
  const aPropia = (m: number) => (enOtra ? convertir(m, cambio) : m);

  const precioOrigT = precio > 0 ? precioPorTonelada(precio, unidad) : 0;
  const precioT = enOtra ? redondear4(precioOrigT * cambio) : precioOrigT;

  // ---- el papel, en la moneda propia ----
  const partesKg = partes.filter((p) => p.kg > 0).map((p) => ({ lote_id: p.lote.id, kg: p.kg }));
  const loteDeDeuda = (id: string): string | null => {
    for (const [loteId, lista] of Object.entries(deudasPorLote)) if (lista.some((d) => d.id === id)) return loteId;
    return null;
  };
  const deudasPapel = Object.entries(marcadas)
    .filter(([, m]) => m > 0)
    .map(([deuda_id, monto]) => ({ deuda_id, lote_id: loteDeDeuda(deuda_id), monto }));
  const descuentosPapel = descuentos.filter((d) => d.monto > 0).map((d) => ({ categoria: d.categoria, monto: aPropia(d.monto) }));
  // `decimales`: el reparto entre campañas corta en la unidad de la moneda
  // propia, así en guaraníes no nacen gastos con centavos.
  const base: Papel = {
    fecha, comprador, precioTonelada: precioT, descuentos: descuentosPapel, deudas: deudasPapel, grano: [], partesKg,
    decimales: decimalesDe(moneda),
  };

  let papel: Papel;
  let restoCanje = 0;
  if (canje) {
    // Primero las deudas marcadas (topadas al bruto); lo que queda del
    // grano pagó «otra cosa», y el neto es cero.
    const previo = toparCompensaciones(base);
    restoCanje = Math.max(0, previo.neto);
    papel = {
      ...previo.papel,
      grano: restoCanje > 0 ? [{
        categoria: canjeCategoria,
        monto: restoCanje,
        descripcion: canjeDescripcion.trim(),
      }] : [],
    };
  } else {
    papel = {
      ...base,
      grano: grano.filter((g) => g.monto > 0)
        .map((g) => ({ categoria: g.categoria, monto: aPropia(g.monto), descripcion: g.descripcion.trim() })),
    };
  }
  const topado = toparCompensaciones(papel);
  const reparto = repartirLiquidacion(topado.papel);
  const bruto = brutoDelPapel(topado.papel);
  const neto = reparto.neto;
  const seQuedo = reparto.descuentos + reparto.compensado + reparto.grano;
  // El bruto como viene en el papel, para sugerir la retención en esa moneda.
  const brutoPapel = partesKg.reduce((a, p) => a + brutoDe(p.kg, precioOrigT), 0);

  // ---- avisos y lo que frena ----
  const cultivo = cultivoPorNombre(lote.cultivo).clave;
  const precioUSDt = moneda === 'USD' ? precioT : enOtra && otra === 'USD' ? precioOrigT : null;
  const avisoP = precioUSDt !== null && precioUSDt > 0 ? avisoPrecio(cultivo, precioUSDt) : 'ok';
  const rango = cultivoPorNombre(lote.cultivo).precioRango;
  const fechaMin = partes.reduce((m, p) => (p.lote.abierto_el < m ? p.lote.abierto_el : m), lote.abierto_el);
  const fechaMala = !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha < fechaMin || fecha > hoy;
  const kilosMal = partes.some((p) => p.kg <= 0);
  const deudaDeMas = Object.entries(marcadas).some(([id, m]) => {
    const d = Object.values(deudasPorLote).flat().find((x) => x.id === id);
    return !!d && m > Number(d.saldo) + 0.001;
  });
  const bloqueado = kilosMal || precio <= 0 || fechaMala || neto < 0 || deudaDeMas
    || (enOtra && (dolar <= 0 || avisoD === 'bloqueo'));

  const otrosDisponibles = otrosLotes.filter((o) => !partes.some((p) => p.lote.id === o.id));
  const compradores = [...new Set(destinos.map((d) => d.trim()).filter(Boolean))].slice(0, 6);
  const nombreDeDeuda = (id: string) => Object.values(deudasPorLote).flat().find((d) => d.id === id)?.nombre ?? '';

  async function sumarParte(o: Lote) {
    setPartes((ps) => [...ps, { lote: o, kg: Math.max(0, Math.round(Number(o.kg_sin_vender) || 0)) }]);
    // Sus deudas a cosecha vienen con su resumen; si no llegan, se carga
    // igual sin ellas.
    try {
      const { data } = await clienteNavegador().rpc('resumen_lote', { p_empresa: empresaId, p_lote: o.id });
      const lista = (data as LoteDetalle | null)?.deudas ?? [];
      setDeudasPorLote((m) => ({ ...m, [o.id]: lista }));
    } catch { /* sin sus deudas: el papel se carga igual */ }
  }

  function sacarParte(id: string) {
    setPartes((ps) => ps.filter((p) => p.lote.id !== id));
    const suyas = new Set((deudasPorLote[id] ?? []).map((d) => d.id));
    setMarcadas((m) => Object.fromEntries(Object.entries(m).filter(([k]) => !suyas.has(k))));
  }

  /**
   * El renglón nuevo, con el foco ya en su monto: sin esto el foco se
   * quedaba en el precio y lo que se escribía después iba a parar ahí. Se
   * dibuja en el acto (`flushSync`) y se enfoca dentro del mismo toque, que
   * es lo que el iPhone exige para abrir el teclado.
   */
  function agregarFila(lista: 'descuentos' | 'grano', categoria: string) {
    const fila: Fila = { id: siguiente, categoria, monto: 0, descripcion: '' };
    flushSync(() => {
      setSiguiente((n) => n + 1);
      if (lista === 'descuentos') setDescuentos((d) => [...d, fila]);
      else setGrano((g) => [...g, fila]);
    });
    document.getElementById(`liq-${lista}-${fila.id}`)?.focus();
  }

  async function guardar() {
    if (kilosMal) { setError(l.kilosCero); return; }
    if (bloqueado) return;
    const conPlata = neto > 0;
    const r = await correr(() => clienteNavegador().rpc('registrar_liquidacion', {
      p_empresa: empresaId,
      p_grupo: grupo,
      p_fecha: fecha,
      p_comprador: comprador.trim(),
      p_precio_tonelada: precioT,
      p_partes: reparto.partes,
      // Sin plata (canje) no hay cuenta: no entró nada.
      p_cuenta: conPlata ? cuentaDelCobro(cuentas, metodo, cuentaElegida) : null,
      p_metodo: conPlata ? metodo : 'otro',
      p_notas: notas.trim(),
      p_moneda_original: enOtra ? otra : null,
      p_precio_original: enOtra ? precioOrigT : null,
      p_cambio: enOtra ? cambio : null,
    }));
    if (!r.ok) return;
    const resp = r.data as RespuestaLiquidacion | null;
    const netoFinal = Number(resp?.neto ?? neto);
    const kg = partesKg.reduce((a, p) => a + p.kg, 0);
    onListo(canje ? l.listoEntrega(kilos(kg, locale)) : netoFinal > 0 ? l.listo(plata(netoFinal)) : l.listoCanje);
  }

  const decPapel = unidad === 'kg' ? decimalesDe(monedaPapel) : 2;
  const simboloPapel = simboloDe(monedaPapel);

  return (
    <Hoja titulo={canje ? l.entregueKilosPara : l.titulo} onCerrar={onCerrar} bloqueada={ocupado}>
      <p className="-mt-1 text-[13px] leading-relaxed text-tinta/55">
        {canje ? l.canjeDetalle : `${l.detalle} ${l.cuentaDetalle}`}
      </p>

      <div className="mt-4 space-y-4">
        {/* ---- fecha y quién ---- */}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className="etiqueta" htmlFor="liq-comprador">{canje ? l.aQuienEntregaste : l.comprador}</label>
            <input id="liq-comprador" className="campo" maxLength={80} value={comprador} disabled={ocupado}
              placeholder={canje ? l.aQuienEjemplo : l.compradorEjemplo}
              onChange={(e) => setComprador(e.target.value)} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="etiqueta" htmlFor="liq-fecha">{l.fecha}</label>
            <input id="liq-fecha" type="date" className="campo" value={fecha} disabled={ocupado}
              min={fechaMin} max={hoy} onChange={(e) => setFecha(e.target.value)} />
          </div>
        </div>
        {compradores.length > 0 && (
          <div className="-mt-2 flex gap-2 overflow-x-auto scroll-limpio">
            {compradores.map((d) => (
              <button key={d} type="button" disabled={ocupado}
                className={comprador.trim() === d ? 'chip-encendido' : 'chip-apagado'}
                onClick={() => setComprador(d)}>
                {d}
              </button>
            ))}
          </div>
        )}

        {/* ---- de dónde eran los kilos ---- */}
        <div>
          <span className="etiqueta">{l.deDondeKilos}</span>
          <p className="-mt-1 mb-2 text-[12px] leading-snug text-tinta/45">{l.deDondeKilosDetalle}</p>
          <ul className="space-y-2">
            {partes.map((p, i) => (
              <li key={p.lote.id} className="rounded-2xl border border-borde bg-arena/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[13.5px] font-semibold">{nombreLargo(p.lote, idioma)}</span>
                  {i > 0 && (
                    <button type="button" className="boton-texto min-h-[44px] shrink-0 text-[12.5px]" disabled={ocupado}
                      onClick={() => sacarParte(p.lote.id)}>
                      {l.sacarParte}
                    </button>
                  )}
                </div>
                <div className="relative mt-1.5">
                  <CampoMonto className="campo pr-11 text-[18px] font-bold tabular-nums" decimales={0} valor={p.kg}
                    disabled={ocupado} aria-label={l.kilosDe(p.lote.nombre)}
                    alCambiar={(n) => setPartes((ps) => ps.map((x) => (x.lote.id === p.lote.id ? { ...x, kg: n } : x)))} />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-tinta/45">
                    {t.campanas.cosecha.unidadKg}
                  </span>
                </div>
                {Number(p.lote.kg_sin_vender) > 0 && (
                  <p className="mt-1 text-[12px] text-tinta/45">{l.sinVender(kilos(p.lote.kg_sin_vender, locale))}</p>
                )}
              </li>
            ))}
          </ul>
          {otrosDisponibles.length > 0 && partes.length < 10 && (
            <div className="mt-2">
              <span className="text-[12px] text-tinta/45">{l.sumarOtro}</span>
              <div className="mt-1 flex gap-2 overflow-x-auto scroll-limpio">
                {otrosDisponibles.map((o) => (
                  <button key={o.id} type="button" className="chip-apagado" disabled={ocupado}
                    onClick={() => sumarParte(o)}>
                    + {nombreLargo(o, idioma)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ---- el precio, en la moneda del papel ---- */}
        <div>
          <label className="etiqueta" htmlFor="liq-precio">
            {l.precio} <span className="font-normal text-tinta/45">{unidadDelPrecio(monedaPapel, t)}</span>
          </label>
          <CampoMonto id="liq-precio" className="campo text-[18px] font-bold tabular-nums" decimales={decPapel}
            valor={precio} disabled={ocupado} alCambiar={setPrecio} />
          {avisoP === 'aviso' && rango && (
            <p className="mt-1 text-[12.5px] font-medium text-ambar">
              {t.campanas.formulario.precioRaro(precioDicho(rango.min, 'USD', locale, t), precioDicho(rango.max, 'USD', locale, t))}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" aria-pressed={enOtra} disabled={ocupado}
              className={enOtra ? 'chip-encendido' : 'chip-apagado'}
              onClick={() => setEnOtra((v) => !v)}>
              {l.mePagaronEn(l.monedas[otra] ?? otra)}
            </button>
          </div>
          {enOtra && (
            <div className="mt-2">
              <label className="etiqueta" htmlFor="liq-dolar">
                {parDolar ? l.cuantoElDolar : l.cuantoElCambio(otra, moneda)}
              </label>
              <CampoMonto id="liq-dolar" className="campo" decimales={parDolar ? 0 : 4} valor={dolar}
                disabled={ocupado} alCambiar={setDolar} />
              {avisoD === 'aviso' && <p className="mt-1 text-[12.5px] font-medium text-ambar">{t.gastosCampana.moneda.dolarRaro}</p>}
              {avisoD === 'bloqueo' && <p className="mt-1 text-[12.5px] font-medium text-rojo">{t.gastosCampana.moneda.dolarImposible}</p>}
              {dolar <= 0 && <p className="mt-1 text-[12px] text-tinta/45">{t.gastosCampana.moneda.faltaDolar}</p>}
              {precioT > 0 && dolar > 0 && avisoD !== 'bloqueo' && (
                <p className="mt-1 text-[12px] text-tinta/55">
                  {l.convertido(precioDicho(precioT, moneda, locale, t), (parDolar ? dolar : cambio).toLocaleString(locale))}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ---- el bruto ---- */}
        <div className="flex items-baseline justify-between gap-3 border-t border-borde pt-3">
          <span>
            <span className="block text-[14px] font-semibold">{l.bruto}</span>
            <span className="block text-[12px] text-tinta/45">{precio > 0 ? l.brutoDetalle : l.faltaPrecio}</span>
          </span>
          <span className="shrink-0 text-[18px] font-bold tabular-nums">{plata(bruto)}</span>
        </div>

        {/* ---- lo que el silo se quedó (plegado; abierto en el canje) ---- */}
        <div className="rounded-2xl border border-borde">
          <button type="button" className="flex min-h-[48px] w-full items-center justify-between gap-3 px-3 text-left"
            aria-expanded={silo} onClick={() => setSilo((v) => !v)}>
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold">{l.seQuedoConAlgo}</span>
              {!silo && seQuedo > 0 && <span className="block text-[12px] text-tinta/50">{l.seQuedo(plata(seQuedo))}</span>}
            </span>
            <span aria-hidden className="text-tinta/40">{silo ? '−' : '+'}</span>
          </button>

          {silo && (
            <div className="space-y-5 border-t border-borde px-3 pb-4 pt-3">
              <p className="text-[12px] leading-snug text-tinta/45">{l.seQuedoDetalle}</p>

              {/* descuentos */}
              <div>
                <span className="etiqueta">{l.descuentos}</span>
                <p className="-mt-1 mb-2 text-[12px] leading-snug text-tinta/45">{l.descuentosDetalle}</p>
                {descuentos.length > 0 && (
                  <ul className="mb-2 space-y-2">
                    {descuentos.map((d) => (
                      <li key={d.id}>
                        {/* En el celular la categoría va arriba y la casilla ocupa el
                            ancho entero: al costado quedaban ~60 px para los dígitos y
                            «2.400.000» se cortaba, justo el número que se copia del papel. */}
                        <span className="mb-1 block truncate text-[13px] font-medium sm:hidden">{categoriaDeCampana(t, d.categoria)}</span>
                        <div className="flex items-center gap-2">
                          <span className="hidden w-[38%] shrink-0 truncate text-[13px] font-medium sm:block">{categoriaDeCampana(t, d.categoria)}</span>
                          <div className="relative min-w-0 flex-1">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-tinta/45">{simboloPapel}</span>
                            <CampoMonto id={`liq-descuentos-${d.id}`} className="campo pl-11" decimales={decimalesDe(monedaPapel)} valor={d.monto}
                              disabled={ocupado} aria-label={categoriaDeCampana(t, d.categoria)}
                              alCambiar={(n) => setDescuentos((ds) => ds.map((x) => (x.id === d.id ? { ...x, monto: n } : x)))} />
                          </div>
                          <button type="button" className="icono-toque shrink-0 text-tinta/40 hover:bg-arena" disabled={ocupado}
                            aria-label={l.sacarParte}
                            onClick={() => setDescuentos((ds) => ds.filter((x) => x.id !== d.id))}>
                            ✕
                          </button>
                        </div>
                        {d.categoria === 'Retención de IVA' && brutoPapel > 0 && (
                          <button type="button" className="boton-texto min-h-[44px] text-[12.5px]" disabled={ocupado}
                            onClick={() => setDescuentos((ds) => ds.map((x) => (x.id === d.id
                              ? { ...x, monto: retencionSugerida(brutoPapel) } : x)))}>
                            {l.usarRetencion(
                              (RETENCION_IVA * 100).toLocaleString(locale),
                              plata(retencionSugerida(brutoPapel), monedaPapel),
                            )}
                          </button>
                        )}
                        {enOtra && d.monto > 0 && (
                          <p className="text-right text-[11.5px] text-tinta/45">{l.montoConvertido(plata(aPropia(d.monto)))}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {descuentos.length < MAX_DESCUENTOS ? (
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIAS_DESCUENTO.map((c) => (
                      <button key={c} type="button" className="chip-apagado" disabled={ocupado}
                        onClick={() => agregarFila('descuentos', c)}>
                        + {categoriaDeCampana(t, c)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-tinta/45">{l.maxDescuentos(MAX_DESCUENTOS)}</p>
                )}
              </div>

              {/* deudas a cosecha de las campañas del papel */}
              <div>
                <span className="etiqueta">{l.deudas}</span>
                {Object.values(deudasPorLote).flat().length === 0 ? (
                  <p className="text-[12.5px] text-tinta/45">{l.sinDeudas}</p>
                ) : (
                  <>
                    <p className="-mt-1 mb-2 text-[12px] leading-snug text-tinta/45">{l.deudasDetalle}</p>
                    <ul className="space-y-2">
                      {partes.flatMap((p) => deudasPorLote[p.lote.id] ?? []).map((d) => {
                        const on = d.id in marcadas;
                        const monto = marcadas[d.id] ?? 0;
                        return (
                          <li key={d.id} className="rounded-xl bg-superficie">
                            <button type="button" role="checkbox" aria-checked={on} disabled={ocupado}
                              className="flex min-h-[48px] w-full items-center gap-3 text-left"
                              onClick={() => setMarcadas((m) => {
                                if (on) return Object.fromEntries(Object.entries(m).filter(([k]) => k !== d.id));
                                return { ...m, [d.id]: Number(d.saldo) };
                              })}>
                              <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 text-[13px] font-bold ${
                                on ? 'border-verde bg-verde text-sobre-verde' : 'border-borde'}`}>
                                {on ? '✓' : ''}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-[13.5px] font-semibold">{d.nombre}</span>
                                <span className="block truncate text-[12px] text-tinta/50">
                                  {[d.acreedor && t.campanas.deudas.a(d.acreedor), l.debes(plata(Number(d.saldo)))].filter(Boolean).join(' · ')}
                                </span>
                              </span>
                            </button>
                            {on && (
                              <div className="mb-1 ml-9">
                                <label className="text-[12px] text-tinta/55" htmlFor={`liq-deuda-${d.id}`}>{l.cuantoDesconto}</label>
                                <CampoMonto id={`liq-deuda-${d.id}`} className="campo mt-1" decimales={decimalesDe(moneda)}
                                  valor={monto} disabled={ocupado}
                                  alCambiar={(n) => setMarcadas((m) => ({ ...m, [d.id]: n }))} />
                                {monto > Number(d.saldo) + 0.001 && (
                                  <p className="mt-1 text-[12.5px] font-medium text-rojo">{l.masQueSaldo}</p>
                                )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>

              {/* lo que pagó el grano */}
              {canje ? (
                <div>
                  <span className="etiqueta">{l.canjeQuePago}</span>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIAS_GRANO.map((c) => (
                      <button key={c} type="button" aria-pressed={canjeCategoria === c} disabled={ocupado}
                        className={canjeCategoria === c ? 'chip-encendido' : 'chip-apagado'}
                        onClick={() => setCanjeCategoria(c)}>
                        {categoriaDeCampana(t, c)}
                      </button>
                    ))}
                  </div>
                  <input className="campo mt-2" maxLength={200} value={canjeDescripcion} disabled={ocupado}
                    placeholder={l.granoEjemplo} aria-label={l.granoQuePago}
                    onChange={(e) => setCanjeDescripcion(e.target.value)} />
                  <p className="mt-1.5 text-[12.5px] font-medium text-tinta/65">
                    {restoCanje > 0 ? l.canjeResto(plata(restoCanje)) : bruto > 0 ? l.canjeTodoDeuda : ''}
                  </p>
                </div>
              ) : (
                <div>
                  <span className="etiqueta">{l.grano}</span>
                  <p className="-mt-1 mb-2 text-[12px] leading-snug text-tinta/45">{l.granoDetalle}</p>
                  {grano.length > 0 && (
                    <ul className="mb-2 space-y-3">
                      {grano.map((g) => (
                        <li key={g.id} className="space-y-1.5">
                          <span className="block truncate text-[13px] font-medium sm:hidden">{categoriaDeCampana(t, g.categoria)}</span>
                          <div className="flex items-center gap-2">
                            <span className="hidden w-[38%] shrink-0 truncate text-[13px] font-medium sm:block">{categoriaDeCampana(t, g.categoria)}</span>
                            <div className="relative min-w-0 flex-1">
                              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-tinta/45">{simboloPapel}</span>
                              <CampoMonto id={`liq-grano-${g.id}`} className="campo pl-11" decimales={decimalesDe(monedaPapel)} valor={g.monto}
                                disabled={ocupado} aria-label={categoriaDeCampana(t, g.categoria)}
                                alCambiar={(n) => setGrano((gs) => gs.map((x) => (x.id === g.id ? { ...x, monto: n } : x)))} />
                            </div>
                            <button type="button" className="icono-toque shrink-0 text-tinta/40 hover:bg-arena" disabled={ocupado}
                              aria-label={l.sacarParte}
                              onClick={() => setGrano((gs) => gs.filter((x) => x.id !== g.id))}>
                              ✕
                            </button>
                          </div>
                          <input className="campo" maxLength={200} value={g.descripcion} disabled={ocupado}
                            placeholder={l.granoEjemplo} aria-label={l.granoQuePago}
                            onChange={(e) => setGrano((gs) => gs.map((x) => (x.id === g.id ? { ...x, descripcion: e.target.value } : x)))} />
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIAS_GRANO.map((c) => (
                      <button key={c} type="button" className="chip-apagado" disabled={ocupado}
                        onClick={() => agregarFila('grano', c)}>
                        + {categoriaDeCampana(t, c)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ---- el año seco: lo que no entró sigue como deuda ---- */}
        {topado.sinCompensar.length > 0 && (
          <div className="rounded-xl bg-ambar-claro px-3 py-2.5 text-[12.5px] font-medium leading-snug text-ambar">
            <p>{l.noCuadra}</p>
            <ul className="mt-1 list-disc pl-5">
              {topado.sinCompensar.map((s) => (
                <li key={s.deuda_id}>{nombreDeDeuda(s.deuda_id)}: {l.quedaSinCompensar(plata(s.monto))}</li>
              ))}
            </ul>
          </div>
        )}
        {neto < 0 && (
          <p className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[12.5px] font-medium text-rojo">{l.noCuadraSinDeudas}</p>
        )}

        {/* ---- el neto, grande ---- */}
        <div className="rounded-2xl bg-verde-claro/60 px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span>
              <span className="block text-[14px] font-bold">{l.neto}</span>
              <span className="block text-[12px] text-tinta/50">{neto === 0 && bruto > 0 ? l.netoCero : l.netoDetalle}</span>
            </span>
            <span className={`shrink-0 font-titulo text-[26px] font-extrabold tabular-nums tracking-tight ${
              neto < 0 ? 'text-rojo' : 'text-verde-fuerte'}`}>
              {plata(Math.max(neto, 0))}
            </span>
          </div>
        </div>

        {/* ---- a qué cuenta entró (sin plata, no hay cuenta) ---- */}
        {!canje && neto > 0 && (
          <div>
            <span className="etiqueta">{l.cuenta}</span>
            <FormaDeCobro
              cuentas={cuentas} metodo={metodo}
              alElegirMetodo={(m) => { setMetodo(m); setCuentaElegida(null); }}
              elegida={cuentaElegida} alElegirCuenta={setCuentaElegida}
              deshabilitado={ocupado}
            />
          </div>
        )}

        <div>
          <label className="etiqueta" htmlFor="liq-notas">{l.notas}</label>
          <input id="liq-notas" className="campo" maxLength={300} value={notas} disabled={ocupado}
            onChange={(e) => setNotas(e.target.value)} />
        </div>
      </div>

      <MensajeError texto={error} />

      <button type="button" className="boton-principal mt-5 min-h-[48px] w-full"
        disabled={ocupado || bloqueado} onClick={guardar}>
        {ocupado ? l.guardando : canje ? l.guardarCanje : l.guardar}
      </button>
    </Hoja>
  );
}
