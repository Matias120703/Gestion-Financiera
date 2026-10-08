'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTextos, useLocale, useIdioma } from '@/i18n/cliente';
import { metodoVisible } from '@/i18n/nombres';
import { categoriaDelRubro } from '@/i18n/textos/gastos-campana';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { CampoMonto } from '@/components/CampoMonto';
import { dinero, decimalesDe, fechaLegible, numero, simboloDe } from '@/lib/formato';
import { hoyISO, sumarDias } from '@/lib/fechas';
import { useZona } from '@/lib/zona';
import type { CuentaParaElegir, Movimiento, Rol } from '@/lib/tipos';
import { Vacio, Seccion } from '@/components/Piezas';
import { puedeAnular } from '@/lib/permisos';
import { mensajeDeError } from '@/lib/errores';
import { DialogoAnular } from '@/components/DialogoAnular';
import { ElegirCuenta, MontoEnCuenta, cuentaDelCobro, cuentaTocada } from '@/components/FormaDeCobro';
import { aOtra, aPropia } from '@/lib/monedas';
import {
  CULTIVOS, NO_SON_DE_CAMPANA, avisoDolar, convertirDesde, cultivoPorNombre, otraMoneda, repartirPorHectareas,
} from '@/lib/agricultura';
import {
  anularPartes, etiquetaCampana, sinNumeroDeParte, useVinculosDeCampana,
  type CampanaParaElegir, type ParteDeReparto,
} from '@/components/ListaMovimientos';

/**
 * Las seis que más se usan van como chips: un toque y listo. El resto sigue
 * disponible escribiendo en el campo, que tiene autocompletado.
 */
const RAPIDAS_GASTO = ['Mercadería', 'Transporte', 'Comida', 'Servicios', 'Publicidad', 'Otros'];
const RAPIDAS_INGRESO = ['Aporte', 'Préstamo', 'Devolución', 'Otros'];
const SUGERIDAS = ['Mercadería', 'Transporte', 'Comida', 'Publicidad', 'Servicios', 'Alquiler', 'Sueldos', 'Impuestos', 'Otros'];


/** Las formas de pago, en el orden de los chips. Se guarda el código; lo que se lee sale de `metodoVisible`. */
const METODOS = ['efectivo', 'transferencia', 'tarjeta', 'credito', 'otro'];

/**
 * «A cosecha» no es una forma de pago que se guarde: con ella no nace un
 * gasto sino una deuda de la campaña (`crear_deuda`). Vive entre los chips
 * de forma de pago porque así lo dice el productor —«lo saqué a cosecha»—,
 * pero este código nunca llega a `movimientos.metodo_pago`.
 */
const A_COSECHA = 'a_cosecha';

/** Dónde se acuerda la pantalla de la última campaña y el último dólar, por negocio. */
const claveCampana = (empresa: string) => `orden:campana:${empresa}`;
const claveDolar = (empresa: string) => `orden:dolar:${empresa}`;

const trazo = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

/**
 * Repartir en la moneda del negocio. `repartirPorHectareas` trabaja en
 * centavos; en guaraníes no hay centavos, así que se le da el monto en
 * «centenas» y se vuelve a multiplicar: cada parte sale en guaraníes
 * enteros y la suma sigue siendo exacta.
 */
function repartirEn(moneda: string, monto: number, campanas: CampanaParaElegir[]) {
  const lista = campanas.map((c) => ({ id: c.id, hectareas: c.hectareas }));
  if (decimalesDe(moneda) > 0) return repartirPorHectareas(monto, lista);
  return repartirPorHectareas(monto / 100, lista).map((p) => ({ id: p.id, monto: Math.round(p.monto * 100) }));
}

export function PantallaGastos({
  empresaId, moneda, movimientos, categoriasUsadas, rol, userId, hoy, hayMas = false, cuentas = [],
  conCampanas = false, campanas = [], loteInicial = null, categoriasRubro = [], dolarDeHoy = null,
  categoriaPorDefecto = null, rapidasPersonal, cuentasOtras = [],
}: {
  empresaId: string;
  moneda: string;
  /** Solo la primera página. Los totales del periodo vienen agregados de la base. */
  movimientos: Movimiento[];
  categoriasUsadas: string[];
  rol: Rol;
  userId: string;
  hoy: string;
  hayMas?: boolean;
  /** Las cuentas de la billetera, para elegir una a mano (075). */
  cuentas?: CuentaParaElegir[];
  /**
   * Las cuentas en OTRA moneda (131): la tarjeta en dólares, Binance. Van
   * aparte de `cuentas` (que siguen siendo las de la moneda del negocio) y
   * solo esta pantalla las ofrece. Con una de estas se pregunta cuánto salió
   * en su moneda; el gasto se guarda en la del negocio, como siempre.
   */
  cuentasOtras?: CuentaParaElegir[];
  /** Si el negocio tiene lotes (`ficha.secciones['/lotes']`): chip de campaña y moneda (100). */
  conCampanas?: boolean;
  /** Las campañas ABIERTAS, para el chip «¿De qué campaña?». */
  campanas?: CampanaParaElegir[];
  /** `?lote=`: se llega desde «Cargar gasto» de una tarjeta y la campaña ya viene elegida. */
  loteInicial?: string | null;
  /** Las categorías del rubro (101): el sojero no compra «Mercadería», compra semilla. */
  categoriasRubro?: string[];
  /** El dólar de la vista en otra moneda (051), como lo dice la persona: guaraníes por dólar. */
  dolarDeHoy?: number | null;
  /** Con qué categoría arranca, si no es la primera del rubro (el ganadero arranca en «Otros»). */
  categoriaPorDefecto?: string | null;
  /**
   * Las categorías de una PERSONA, para los chips (28/09/2026): Comida,
   * Alquiler, Salud… y en lo que entra Sueldo, Extra, Changa… Salen de la
   * base, las mismas con que clasifica la captura, con las propias
   * mezcladas. Sin esto la cuenta personal veía «Mercadería», «Publicidad»,
   * «Aporte» y «Préstamo»: le hablaba como a un almacén. Vale con cualquier
   * plan, y en el Gratis, Gastos es LA pantalla.
   */
  rapidasPersonal?: { gasto: string[]; ingreso: string[] };
}) {
  const t = useTextos();
  const locale = useLocale();
  const idioma = useIdioma();
  const zona = useZona();
  const router = useRouter();
  const dec = decimalesDe(moneda);
  const esAdmin = rol === 'propietario' || rol === 'admin';

  // En un negocio con lotes, las categorías del rubro mandan (las 14 del
  // agricultor, en dos columnas). En una cuenta personal, las suyas
  // (28/09/2026). En el resto, las seis de siempre.
  const rapidasGasto = rapidasPersonal
    ? rapidasPersonal.gasto
    : (conCampanas && categoriasRubro.length > 0 ? categoriasRubro : RAPIDAS_GASTO);
  // La grilla (y arrancar en la primera) es solo del campo. La personal va en
  // fila y arranca en «Otros», por lo mismo que el negocio: una categoría
  // elegida de antemano ensucia los números de quien no la toca.
  const conGrilla = conCampanas && rapidasGasto !== RAPIDAS_GASTO;

  const [tipo, setTipo] = useState<'gasto' | 'ingreso'>('gasto');
  const [descripcion, setDescripcion] = useState('');
  /** Lo que se escribió: en la moneda propia, o en la otra si se tocó «Pagué en…». */
  const [monto, setMonto] = useState<number>(0);
  // Sin «Mercadería» elegida de antemano (106): desde que la compra de
  // mercadería no resta de la ganancia cuando hay costo cargado, un gasto de
  // luz o de flete guardado sin tocar la categoría se iría a «Compraste
  // mercadería» y desaparecería de la ganancia. Arranca en «Otros» y la
  // compra de mercadería se elige con un toque. En el campo la primera de su
  // lista (Semilla) no cambia nada de eso y se queda como estaba.
  const categoriaInicial = conGrilla
    ? (categoriaPorDefecto && rapidasGasto.includes(categoriaPorDefecto) ? categoriaPorDefecto : (rapidasGasto[0] ?? 'Otros'))
    : 'Otros';
  const [categoria, setCategoria] = useState(categoriaInicial);
  const [fecha, setFecha] = useState(hoyISO(zona));
  const [metodo, setMetodo] = useState('efectivo');
  /**
   * La cuenta tocada a mano (075). Null = la de siempre para esa forma de
   * pago, que es la que `ElegirCuenta` muestra marcada (01/10).
   */
  const [cuentaId, setCuentaId] = useState<string | null>(null);
  /**
   * La cuenta en OTRA moneda que se tocó (131), y cuánto salió o entró en su
   * moneda. Nunca queda marcada sola. El importe puede estar `propuesto`
   * (sale de la cotización y sigue al monto de arriba), `escrito` por la
   * persona, o ser el que `manda`: se escribió con el monto de arriba vacío
   * y es el de arriba el que lo sigue.
   */
  const [otraId, setOtraId] = useState<string | null>(null);
  const [montoCuenta, setMontoCuenta] = useState(0);
  const [modoCuenta, setModoCuenta] = useState<'propuesto' | 'escrito' | 'manda'>('propuesto');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [exitoDetalle, setExitoDetalle] = useState('');
  const [tonoExito, setTonoExito] = useState<'gasto' | 'ingreso' | 'deuda'>('gasto');
  const [aAnular, setAAnular] = useState<Movimiento | null>(null);
  const [aAnularJuntas, setAAnularJuntas] = useState<{ movimiento: Movimiento; partes: ParteDeReparto[] } | null>(null);
  const [masOpciones, setMasOpciones] = useState(false);

  // ---- la campaña (100) ----
  const valida = (id: string | null | undefined) => Boolean(id && campanas.some((c) => c.id === id));
  const [loteId, setLoteId] = useState<string>(valida(loteInicial) ? (loteInicial as string) : '');
  const [repartir, setRepartir] = useState(false);
  // ---- la otra moneda (100) ----
  const [enOtra, setEnOtra] = useState(false);
  const [dolar, setDolar] = useState<number>(dolarDeHoy && dolarDeHoy > 0 ? dolarDeHoy : 0);
  // ---- a cosecha (100) ----
  const [proveedor, setProveedor] = useState('');
  const [vence, setVence] = useState('');

  /**
   * La última campaña y el último dólar, del navegador. Se leen después de
   * montar (en el servidor no hay `localStorage`, y pintar distinto en cada
   * lado rompe la hidratación) y se tolera que no exista: una ventana
   * privada simplemente arranca en «Ninguna».
   */
  useEffect(() => {
    try {
      if (!valida(loteInicial)) {
        const ultima = localStorage.getItem(claveCampana(empresaId));
        if (valida(ultima)) setLoteId(ultima as string);
      }
      if (!(dolarDeHoy && dolarDeHoy > 0)) {
        const d = Number(localStorage.getItem(claveDolar(empresaId)));
        if (Number.isFinite(d) && d > 0) setDolar(d);
      }
    } catch { /* sin almacenamiento: se elige a mano */ }
    // Solo al montar: después manda lo que toque la persona.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lo que entra arranca en «Otros ingresos» (al tocar «Entró»): en la lista
  // de una persona es un chip; en la de un negocio queda escrito aparte.
  const rapidas = tipo === 'gasto' ? rapidasGasto : (rapidasPersonal?.ingreso ?? RAPIDAS_INGRESO);

  // A una persona tampoco se le sugiere «Mercadería» ni «Impuestos» al escribir.
  const categorias = Array.from(new Set([
    ...categoriasUsadas, ...rapidasGasto, ...(rapidasPersonal ? [] : SUGERIDAS),
  ])).filter(Boolean);

  // ---------------------------------------------------------------- campaña
  const mostrarChip = conCampanas && campanas.length > 0
    && !(tipo === 'ingreso' && NO_SON_DE_CAMPANA.includes(categoria));
  const aCosecha = metodo === A_COSECHA;
  const puedeRepartir = mostrarChip && tipo === 'gasto' && campanas.length >= 2 && !aCosecha;
  const repartiendo = repartir && puedeRepartir;
  const lote = mostrarChip && !repartiendo ? campanas.find((c) => c.id === loteId) ?? null : null;
  const metodos = [
    ...METODOS,
    // Solo administración carga deudas (015), y una deuda a cosecha siempre
    // es de una campaña: sin campañas abiertas no se ofrece.
    ...(conCampanas && esAdmin && tipo === 'gasto' && campanas.length > 0 ? [A_COSECHA] : []),
  ];

  function elegirLote(id: string) {
    setLoteId(id);
    setRepartir(false);
    try { localStorage.setItem(claveCampana(empresaId), id); } catch { /* se elige de nuevo la próxima */ }
    if (aCosecha) setVence(venceSugerido(id));
  }

  /**
   * El vencimiento «a cosecha» sugerido: la casa de insumos se cobra con el
   * grano, así que vence cuando el grano existe. Desde que se abrió la
   * campaña, los días típicos del cultivo. Si esa fecha ya pasó, la campaña
   * está cosechando: un mes.
   */
  function venceSugerido(id: string): string {
    const c = campanas.find((x) => x.id === id);
    const hoyLocal = hoyISO(zona);
    if (!c) return '';
    const cultivo = CULTIVOS.find((x) => x.clave === c.cultivo) ?? cultivoPorNombre(c.cultivo);
    const estimada = sumarDias(c.abierto_el, cultivo.diasHastaCosecha);
    return estimada > hoyLocal ? estimada : sumarDias(hoyLocal, 30);
  }

  function elegirMetodo(v: string) {
    setMetodo(v);
    // Otra forma de pago, otra cuenta: la tocada antes puede no servir.
    setCuentaId(null);
    soltarOtra();
    if (v === A_COSECHA) {
      setRepartir(false);
      if (!vence) setVence(venceSugerido(loteId));
    }
  }

  // ----------------------------------------------------------------- moneda
  const otra = otraMoneda(moneda);
  /** Con la pareja guaraní/dólar se escribe «el dólar está a 6.000»; con otra, el cambio directo. */
  const parDolar = (moneda === 'PYG' && otra === 'USD') || (moneda === 'USD' && otra === 'PYG');
  const conversion = enOtra && dolar > 0 && monto > 0 ? convertirDesde(moneda, otra, monto, dolar) : null;
  const avisoDelDolar = enOtra && parDolar && dolar > 0 ? avisoDolar(dolar) : 'ok';
  /** Lo que se guarda en `monto`: siempre en la moneda del negocio. */
  const montoFinal = enOtra ? conversion?.monto ?? 0 : monto;
  const nombreMoneda = (m: string) => t.gastosCampana.moneda.nombres[m] ?? m;

  // --------------------------------------- la cuenta en otra moneda (131)
  /*
    Pagó con la tarjeta en dólares, o con Binance. El gasto se guarda en la
    moneda del negocio, como todos (`montoFinal`); de la cuenta salió OTRO
    importe, en su moneda, y ese lo dice la persona. Orden no convierte solo:
    con una cotización guardada lo propone, y sin ese importe no se guarda.
    Una deuda a cosecha no sale de ninguna cuenta. Y lo que ENTRA a crédito
    es fiado: no va a ninguna, tampoco a la que quedó tocada de antes.
  */
  const otraTocada = aCosecha ? null : cuentaTocada(cuentasOtras, otraId, metodo, tipo === 'gasto' ? 'sale' : 'entra');
  const monedaDeLaOtra = otraTocada?.moneda ?? moneda;
  const cotizacionDeLaOtra = otraTocada && Number(otraTocada.cotizacion) > 0 ? Number(otraTocada.cotizacion) : null;
  /** «Pagué en dólares» (100) y la cuenta es en dólares: lo de arriba ES lo que salió de ella. */
  const pagoEnLaDeLaCuenta = Boolean(otraTocada) && enOtra && otra === monedaDeLaOtra;
  const importeCuenta = !otraTocada ? 0
    : pagoEnLaDeLaCuenta ? monto
      : modoCuenta !== 'propuesto' ? montoCuenta
        : (cotizacionDeLaOtra && montoFinal > 0 ? aOtra(montoFinal, cotizacionDeLaOtra, monedaDeLaOtra) : 0);
  const faltaImporteCuenta = Boolean(otraTocada) && !(importeCuenta > 0);
  /** «Salen US$ 15,99 de Tarjeta dólares»: lo que se mueve en la cuenta, dicho en su moneda. */
  const fraseDeLaOtra = otraTocada && importeCuenta > 0
    ? (tipo === 'gasto'
      ? t.monedas.cobro.salenDe(dinero(importeCuenta, monedaDeLaOtra), otraTocada.nombre)
      : t.monedas.cobro.entranA(dinero(importeCuenta, monedaDeLaOtra), otraTocada.nombre))
    : '';

  function soltarOtra() {
    setOtraId(null);
    setMontoCuenta(0);
    setModoCuenta('propuesto');
  }

  /** Se escribió cuánto salió de la cuenta. Con cotización y el monto de arriba vacío, arriba se llena solo (y se puede corregir). */
  function escribirEnCuenta(n: number) {
    setMontoCuenta(n);
    if (cotizacionDeLaOtra && !enOtra && (monto === 0 || modoCuenta === 'manda')) {
      setModoCuenta('manda');
      setMonto(aPropia(n, cotizacionDeLaOtra, moneda));
    } else {
      setModoCuenta('escrito');
    }
  }

  const reparto = useMemo(
    () => (repartiendo && montoFinal > 0 ? repartirEn(moneda, montoFinal, campanas) : []),
    [repartiendo, montoFinal, moneda, campanas],
  );

  function limpiarDespues() {
    // El dólar que se usó queda para la próxima: el de mañana casi siempre es el mismo.
    if (enOtra && dolar > 0) {
      try { localStorage.setItem(claveDolar(empresaId), String(dolar)); } catch { /* se vuelve a escribir */ }
    }
    setDescripcion(''); setMonto(0); setNotas(''); setProveedor('');
    // (131) La cuenta en otra moneda se suelta: el próximo gasto no puede
    // salir de la de dólares porque quedó tocada del anterior.
    soltarOtra();
    setMasOpciones(false);
    router.refresh();
  }

  function mostrarExito(texto: string, detalle: string, tono: 'gasto' | 'ingreso' | 'deuda') {
    setExito(texto);
    setExitoDetalle(detalle);
    setTonoExito(tono);
    setTimeout(() => { setExito(''); setExitoDetalle(''); }, detalle ? 5200 : 3400);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (enOtra && !(dolar > 0)) { setError(t.gastosCampana.moneda.faltaDolar); return; }
    if (avisoDelDolar === 'bloqueo') { setError(t.gastosCampana.moneda.dolarImposible); return; }
    if (montoFinal <= 0) { setError(t.gastos.montoMayorACero); return; }
    // (131) Con una cuenta en otra moneda, sin su importe no se guarda (el
    // botón ya está apagado; esto es por el Enter).
    if (faltaImporteCuenta) return;
    // La descripción es opcional: si no la escribís, queda la categoría.
    // Escribir texto con el teclado en medio del día es lo que más frena.
    const cat = categoria.trim() || 'General';
    const detalle = descripcion.trim() || cat;
    // Si pagó en la otra moneda, se anota al lado lo que pagó y a qué cambio (100).
    const original = enOtra && conversion
      ? { monto_original: monto, moneda_original: otra, cambio: conversion.cambio }
      : null;

    if (aCosecha) {
      if (!esAdmin) { setError(t.gastosCampana.aCosecha.soloAdmin); return; }
      if (!lote) { setError(t.gastosCampana.aCosecha.faltaLote); return; }
      if (!proveedor.trim()) { setError(t.gastosCampana.aCosecha.faltaProveedor); return; }
    }

    setGuardando(true);
    try {
      const supabase = clienteNavegador();

      /*
        A COSECHA: no sale plata hoy, así que no nace un gasto. Nace una
        DEUDA de la campaña, con la categoría del gasto que va a nacer cuando
        se pague o el silo se la cobre (100, decisión 1). Cuenta en el costo
        de la campaña desde ya.
      */
      if (aCosecha && lote) {
        const notaOriginal = original
          ? t.gastosCampana.moneda.original(dinero(original.monto_original, otra), numero(dolar, locale))
          : '';
        const { error } = await supabase.rpc('crear_deuda', {
          p_empresa: empresaId,
          p_nombre: t.gastosCampana.aCosecha.nombreDeuda(categoriaDelRubro(t, cat), lote.nombre).slice(0, 80),
          p_tipo: 'proveedor',
          p_acreedor: proveedor.trim(),
          p_monto: montoFinal,
          p_vence_el: vence || null,
          p_notas: [notas.trim(), notaOriginal].filter(Boolean).join(' · '),
          p_lote: lote.id,
          p_categoria: cat,
        });
        if (error) throw error;
        const montoTexto = dinero(montoFinal, moneda);
        mostrarExito(
          vence
            ? t.gastosCampana.aCosecha.quedo(lote.nombre, montoTexto, proveedor.trim(), vence.slice(8, 10) + '/' + vence.slice(5, 7))
            : t.gastosCampana.aCosecha.quedoSinVence(lote.nombre, montoTexto, proveedor.trim()),
          t.gastosCampana.aCosecha.quedoDetalle,
          'deuda',
        );
        limpiarDespues();
        return;
      }

      const fila = {
        empresa_id: empresaId,
        tipo,
        fecha,
        descripcion: detalle,
        categoria: cat,
        // Un gasto o ingreso no lleva descuento: subtotal y monto son lo mismo.
        subtotal: montoFinal,
        descuento: 0,
        monto: montoFinal,
        costo_total: 0,
        metodo_pago: metodo,
        contraparte: '',
        notas: notas.trim(),
        // La marcada en «¿De qué cuenta salió?»: la tocada, la de siempre o
        // la única posible. Null (ninguna) deja que el disparador decida (074).
        // Un gasto con «Crédito» es la tarjeta: sale, y se pregunta cuál (01/10).
        cuenta_id: cuentaDelCobro(cuentas, metodo, cuentaId, tipo === 'gasto' ? 'sale' : 'entra'),
        origen: 'manual',
        // (131) Se tocó una cuenta en otra moneda: esa pisa la de arriba y va
        // con cuánto se movió EN SU MONEDA. `monto` sigue en la del negocio.
        ...(otraTocada ? { cuenta_id: otraTocada.id, monto_cuenta: importeCuenta } : {}),
      };

      /*
        REPARTIR ENTRE LAS CAMPAÑAS ABIERTAS (100, decisión 8): el gasoil o
        los jornales de un día se gastan en todas a la vez. N filas con el
        mismo `reparto_id`, en UN solo insert (o entran todas o ninguna), y
        «1/N ·» adelante para que en el historial se lea que es una parte.
        Desde el historial se anulan juntas.
      */
      if (repartiendo && reparto.length > 0) {
        const repartoId = crypto.randomUUID();
        const originales = original ? repartirEn(otra, original.monto_original, campanas) : null;
        // (131) Lo que salió de la cuenta en otra moneda se reparte igual, en
        // su moneda. Si a alguna campaña le tocara cero, la base rechazaría
        // esa fila: se avisa antes y no se guarda nada.
        const deLaCuenta = otraTocada ? repartirEn(monedaDeLaOtra, importeCuenta, campanas) : null;
        if (deLaCuenta && deLaCuenta.some((p) => !(p.monto > 0))) {
          setError(t.monedas.cobro.repartoMuyChico);
          return;
        }
        const n = reparto.length;
        const filas = reparto.map((p, i) => ({
          ...fila,
          descripcion: `${i + 1}/${n} · ${detalle}`.slice(0, 200),
          subtotal: p.monto,
          monto: p.monto,
          lote_id: p.id,
          reparto_id: repartoId,
          ...(original && originales
            ? { monto_original: originales[i].monto, moneda_original: original.moneda_original, cambio: original.cambio }
            : {}),
          ...(deLaCuenta ? { monto_cuenta: deLaCuenta[i].monto } : {}),
        }));
        const { error } = await supabase.from('movimientos').insert(filas);
        if (error) throw error;
        mostrarExito(t.gastosCampana.chip.guardadoRepartido(dinero(montoFinal, moneda), n), fraseDeLaOtra, tipo);
        limpiarDespues();
        return;
      }

      const { error } = await supabase.from('movimientos').insert({
        ...fila,
        ...(lote ? { lote_id: lote.id } : {}),
        ...(original ?? {}),
      });
      if (error) throw error;
      // «Semilla US$ 3.400 en Norte · US$ 68 por hectárea»: el número que el
      // productor compara con «los 750 dólares» de la zona, en el momento.
      if (lote) {
        const porHa = lote.hectareas && lote.hectareas > 0
          ? ` · ${t.gastosCampana.chip.porHectarea(dinero(montoFinal / lote.hectareas, moneda))}`
          : '';
        mostrarExito(
          t.gastosCampana.chip.guardadoEn(categoriaDelRubro(t, cat), dinero(montoFinal, moneda), lote.nombre) + porHa,
          fraseDeLaOtra, tipo,
        );
      } else {
        // (131) Con una cuenta en otra moneda, debajo va lo que se movió en ella.
        mostrarExito(t.gastos.registrado(tipo === 'gasto', dinero(montoFinal, moneda)), fraseDeLaOtra, tipo);
      }
      limpiarDespues();
    } catch (e: any) {
      setError(mensajeDeError(e, t.gastos.noSePudoGuardar));
    } finally {
      setGuardando(false);
    }
  }

  // ------------------------------------------------------ lista del periodo
  const ids = useMemo(() => movimientos.map((m) => m.id), [movimientos]);
  const { vinculos, repartos, recargar, conocido } = useVinculosDeCampana(ids, conCampanas);
  const nombreLote = useMemo(() => {
    const mapa = new Map(campanas.map((c) => [c.id, c.nombre]));
    return (id: string | null | undefined) => (id ? mapa.get(id) ?? null : null);
  }, [campanas]);

  async function anular(id: string, motivo: string) {
    const supabase = clienteNavegador();
    const { error } = await supabase.rpc('anular_movimiento', {
      p_movimiento: id,
      p_motivo: motivo || null,
    });
    if (error) throw new Error(mensajeDeError(error, t.gastos.noSePudoAnular));
    setAAnular(null);
    recargar();
    router.refresh();
  }

  async function anularJuntas(partes: ParteDeReparto[], motivo: string) {
    try {
      const hechas = await anularPartes(partes, motivo, t);
      setAAnularJuntas(null);
      mostrarExito(t.gastosCampana.historial.anuladasJuntas(hechas), '', 'gasto');
    } finally {
      recargar();
      router.refresh();
    }
  }

  const bloqueFormaDePago = (
    <div>
      <span className="etiqueta">{t.pantallas.formaDePago}</span>
      <div className="flex flex-wrap gap-2">
        {metodos.map((v) => (
          <button
            key={v} type="button" onClick={() => elegirMetodo(v)}
            className={metodo === v ? 'chip-encendido' : 'chip-apagado'}
          >
            {v === A_COSECHA ? t.gastosCampana.aCosecha.forma : metodoVisible(t, v)}
          </button>
        ))}
      </div>
      {aCosecha && (
        <div className="mt-3 space-y-3 rounded-2xl border border-ambar/30 bg-ambar-claro/60 p-3.5 aparecer">
          <p className="text-[12.5px] leading-snug text-tinta/60">{t.gastosCampana.aCosecha.formaDetalle}</p>
          <label className="block">
            <span className="etiqueta">{t.gastosCampana.aCosecha.proveedor}</span>
            <input
              className="campo" maxLength={80}
              placeholder={t.gastosCampana.aCosecha.proveedorEjemplo}
              value={proveedor} onChange={(e) => setProveedor(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="etiqueta mb-0.5">{t.gastosCampana.aCosecha.vence}</span>
            <span className="mb-1.5 block text-[12px] leading-snug text-tinta/45">{t.gastosCampana.aCosecha.venceDetalle}</span>
            <input type="date" className="campo" value={vence} onChange={(e) => setVence(e.target.value)} />
          </label>
        </div>
      )}
    </div>
  );

  /*
    DE QUÉ CUENTA SALIÓ, O A CUÁL ENTRÓ (075, 083; 01/10 la misma pieza que
    en todos lados). Desde la primera cuenta: con una sola dice a dónde va,
    con dos bancos deja elegir cuál, y si ninguna recibe esa forma de pago lo
    avisa antes de guardar. Una deuda a cosecha no sale de ninguna cuenta.
  */
  const bloqueCuenta = (cuentas.length > 0 || cuentasOtras.length > 0) && !aCosecha ? (
    <ElegirCuenta
      cuentas={cuentas} metodo={metodo} elegida={cuentaId}
      alElegir={(id) => { setCuentaId(id); soltarOtra(); }}
      sentido={tipo === 'gasto' ? 'sale' : 'entra'}
      // (131) Después de las de siempre, las que están en otra moneda.
      otras={cuentasOtras} otraElegida={otraId}
      alElegirOtra={(id) => { soltarOtra(); setOtraId(id); }}
    />
  ) : null;

  /*
    CUÁNTO SALIÓ EN LA MONEDA DE LA CUENTA (131). Aparece al tocar una cuenta
    en otra moneda y no se esconde con «Menos detalles»: mientras esté a la
    vista, se sabe que este gasto sale de la cuenta en dólares. Si se pagó en
    esa misma moneda («Pagué en dólares», 100) no hay segundo campo: lo de
    arriba es lo que salió.
  */
  const bloqueMontoCuenta = (conNombre: boolean) => (!otraTocada ? null : pagoEnLaDeLaCuenta ? (
    <p className="text-[12.5px] font-semibold tabular-nums text-tinta/60">{fraseDeLaOtra}</p>
  ) : (
    <MontoEnCuenta
      cuenta={otraTocada} propia={moneda} montoPropio={montoFinal}
      valor={importeCuenta} alCambiar={escribirEnCuenta}
      sentido={tipo === 'gasto' ? 'sale' : 'entra'}
      // Con los chips de las cuentas plegados, dice de cuál se habla.
      conNombre={conNombre}
    />
  ));

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      {exito && (
        <div className="fixed inset-x-0 top-[60px] z-50 px-3 lg:top-24" role="status" aria-live="polite">
          {/* El texto, del color que se lee sobre cada fondo en los dos temas
              (01/10): el blanco fijo no se leía sobre el rojo y el ámbar del
              oscuro, que son claros, ni nunca sobre el verde vivo. */}
          <div className={`destello mx-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-3.5 shadow-[0_12px_34px_-8px_rgba(13,27,22,.5)] ${
            tonoExito === 'gasto' ? 'bg-rojo text-superficie' : tonoExito === 'deuda' ? 'bg-ambar text-noche' : 'bg-verde text-sobre-verde'
          }`}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/20">
              <svg viewBox="0 0 24 24" className="h-5 w-5" {...trazo} strokeWidth={2.4}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
            </span>
            <div className="min-w-0">
              <p className="text-[15.5px] font-bold leading-tight">{exito}</p>
              {exitoDetalle && <p className="mt-0.5 text-[12.5px] leading-snug opacity-90">{exitoDetalle}</p>}
            </div>
          </div>
        </div>
      )}
      {/* ------------------------------ formulario ------------------------------ */}
      <div className="tarjeta h-fit p-4">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-arena p-1">
          {(['gasto', 'ingreso'] as const).map((clase) => (
            <button
              key={clase} type="button"
              onClick={() => {
                setTipo(clase);
                setCategoria(clase === 'gasto' ? categoriaInicial : 'Otros ingresos');
                // Lo que entra no se debe ni se reparte.
                if (clase === 'ingreso') { setRepartir(false); if (metodo === A_COSECHA) setMetodo('efectivo'); }
              }}
              className={`rounded-lg py-2 text-[13.5px] font-bold transition ${
                tipo === clase ? 'bg-superficie shadow-sm ' + (clase === 'gasto' ? 'text-rojo' : 'text-verde-fuerte') : 'text-tinta/50'
              }`}
            >
              {clase === 'gasto' ? t.gastos.salioPlata : t.gastos.entroPlata}
            </button>
          ))}
        </div>

        {/* Tres toques: monto, categoría, guardar. Todo lo demás tiene un
            valor por defecto razonable y está plegado. */}
        <form onSubmit={guardar} className="mt-4 space-y-3">
          <label className="block">
            <span className="etiqueta">{t.pantallas.cuanto}</span>
            {/* Con separadores mientras se teclea: en guaraníes, «1500000»
                y «150000» se distinguen contando ceros. Ver CampoMonto.tsx. */}
            <CampoMonto
              className="campo text-[26px] font-titulo font-extrabold" autoFocus
              valor={monto} decimales={enOtra ? decimalesDe(otra) : dec} placeholder="0"
              alCambiar={(n) => {
                setMonto(Math.max(0, n));
                // (131) Si este monto venía siguiendo al de la cuenta en otra
                // moneda, al tocarlo deja de seguirlo: los dos quedan escritos.
                if (modoCuenta === 'manda') setModoCuenta('escrito');
              }}
            />
            {monto > 0 && !enOtra && <span className="mt-1 block text-[13px] font-semibold text-tinta/50">{dinero(monto, moneda)}</span>}
            {monto > 0 && enOtra && <span className="mt-1 block text-[13px] font-semibold text-tinta/50">{dinero(monto, otra)}</span>}
          </label>

          {/*
            EN QUÉ MONEDA PAGÓ (100, decisión 7). El sojero lleva todo en
            dólares pero el gasoil y los jornales los paga en guaraníes. Al
            lado del monto, porque es parte del monto: escribe 2.400.000, toca
            «Pagué en guaraníes» y ve «= US$ 400 al dólar de 6.000». Se guarda
            convertido y lo que pagó queda anotado al lado.
          */}
          {conCampanas && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-arena p-1" role="group">
                <button
                  type="button" onClick={() => setEnOtra(false)} aria-pressed={!enOtra}
                  className={`min-h-[44px] rounded-lg px-2 text-[13px] font-bold transition ${!enOtra ? 'bg-superficie text-tinta shadow-sm' : 'text-tinta/50'}`}
                >
                  {t.gastosCampana.moneda.enMiMoneda(nombreMoneda(moneda))}
                </button>
                <button
                  type="button" onClick={() => setEnOtra(true)} aria-pressed={enOtra}
                  className={`min-h-[44px] rounded-lg px-2 text-[13px] font-bold transition ${enOtra ? 'bg-superficie text-tinta shadow-sm' : 'text-tinta/50'}`}
                >
                  {tipo === 'gasto'
                    ? t.gastosCampana.moneda.pagueEn(nombreMoneda(otra))
                    : t.gastosCampana.moneda.cobreEn(nombreMoneda(otra))}
                </button>
              </div>

              {enOtra && (
                <div className="rounded-2xl border border-borde/70 bg-arena/40 p-3.5 aparecer">
                  <label className="block">
                    <span className="etiqueta">
                      {parDolar
                        ? t.gastosCampana.moneda.cuantoElDolar
                        : t.gastosCampana.moneda.cuantoElCambio(simboloDe(otra), simboloDe(moneda))}
                    </span>
                    <CampoMonto
                      className="campo" decimales={parDolar ? 0 : 4} placeholder="0"
                      valor={dolar} alCambiar={(n) => setDolar(Math.max(0, n))}
                    />
                  </label>
                  {conversion && avisoDelDolar !== 'bloqueo' && (
                    <p className="mt-2 text-[14px] font-bold text-tinta">
                      {parDolar
                        ? t.gastosCampana.moneda.convertido(dinero(conversion.monto, moneda), numero(dolar, locale))
                        : t.gastosCampana.moneda.convertidoCambio(dinero(conversion.monto, moneda), numero(dolar, locale))}
                    </p>
                  )}
                  {!(dolar > 0) && (
                    <p className="mt-2 text-[12.5px] font-medium text-ambar">{t.gastosCampana.moneda.faltaDolar}</p>
                  )}
                  {avisoDelDolar === 'aviso' && (
                    <p className="mt-2 rounded-lg bg-ambar-claro px-3 py-2 text-[12.5px] font-medium text-ambar">{t.gastosCampana.moneda.dolarRaro}</p>
                  )}
                  {avisoDelDolar === 'bloqueo' && (
                    <p className="mt-2 rounded-lg bg-rojo-claro px-3 py-2 text-[12.5px] font-medium text-rojo">{t.gastosCampana.moneda.dolarImposible}</p>
                  )}
                  <p className="mt-2 text-[12px] leading-snug text-tinta/45">{t.gastosCampana.moneda.seGuardaEn(nombreMoneda(moneda))}</p>
                </div>
              )}
            </div>
          )}

          <div>
            <span className="etiqueta">{t.pantallas.enQue}</span>
            <div className={conGrilla && tipo === 'gasto' ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap gap-2'}>
              {rapidas.map((c) => (
                <button
                  key={c} type="button" onClick={() => setCategoria(c)}
                  className={`${categoria === c ? 'chip-encendido' : 'chip-apagado'} ${conGrilla && tipo === 'gasto' ? 'min-h-[44px] justify-center text-center' : ''}`}
                >
                  {categoriaDelRubro(t, c)}
                </button>
              ))}
            </div>
            {!rapidas.includes(categoria) && (
              <input
                className="campo mt-2" list="categorias-gasto" maxLength={40}
                placeholder={t.pantallas.otraCategoria}
                value={categoria} onChange={(e) => setCategoria(e.target.value)}
              />
            )}
            <datalist id="categorias-gasto">
              {categorias.map((c) => <option key={c} value={c} label={categoriaDelRubro(t, c)} />)}
            </datalist>
          </div>

          {/*
            ¿DE QUÉ CAMPAÑA? (100). A la vista y no plegado: es la pregunta
            que hace que la tarjeta de la campaña diga algo. Recuerda la
            última (el que carga cinco gastos del Norte no la toca cinco
            veces) y «Ninguna» es para los gastos de la casa.
          */}
          {mostrarChip && (
            <div>
              <span className="etiqueta">{t.gastosCampana.chip.deQueLote}</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button" onClick={() => elegirLote('')} aria-pressed={!repartiendo && loteId === ''}
                  className={!repartiendo && loteId === '' ? 'chip-encendido' : 'chip-apagado'}
                >
                  {t.gastosCampana.chip.ninguno}
                </button>
                {campanas.map((c) => (
                  <button
                    key={c.id} type="button" onClick={() => elegirLote(c.id)} aria-pressed={!repartiendo && loteId === c.id}
                    className={!repartiendo && loteId === c.id ? 'chip-encendido' : 'chip-apagado'}
                  >
                    {etiquetaCampana(c, idioma)}
                  </button>
                ))}
                {puedeRepartir && (
                  <button
                    type="button" onClick={() => setRepartir(true)} aria-pressed={repartiendo}
                    className={repartiendo ? 'chip-encendido' : 'chip-apagado'}
                  >
                    {t.gastosCampana.chip.repartir}
                  </button>
                )}
              </div>
              {!repartiendo && !lote && (
                <p className="mt-1.5 text-[12px] leading-snug text-tinta/45">{t.gastosCampana.chip.ningunoDetalle}</p>
              )}
              {lote && lote.hectareas && lote.hectareas > 0 && montoFinal > 0 && (
                <p className="mt-1.5 text-[12.5px] font-semibold text-tinta/55">
                  {t.gastosCampana.chip.porHectarea(dinero(montoFinal / lote.hectareas, moneda))}
                </p>
              )}
              {repartiendo && (
                <div className="mt-1.5 text-[12px] leading-snug text-tinta/50">
                  <p>{t.gastosCampana.chip.repartirDetalle}</p>
                  {reparto.length > 0 && (
                    <p className="mt-1 font-semibold text-tinta/65">
                      {reparto.map((p) => t.gastosCampana.chip.parte(
                        campanas.find((c) => c.id === p.id)?.nombre ?? '', dinero(p.monto, moneda),
                      )).join(' · ')}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Con campañas, la forma de pago va a la vista: «A cosecha» cambia
              lo que se guarda, y no puede quedar escondido en un plegado. La
              cuenta va con ella: es la otra mitad de la misma pregunta. */}
          {conCampanas && bloqueFormaDePago}
          {conCampanas && bloqueCuenta}
          {conCampanas && bloqueMontoCuenta(false)}

          <button
            type="button" onClick={() => setMasOpciones((v) => !v)}
            className="flex min-h-[44px] w-full items-center justify-between rounded-xl px-1 text-[13.5px] font-semibold text-tinta/50"
          >
            {masOpciones ? t.gastos.menosDetalles : t.gastos.masDetalles}
            <svg viewBox="0 0 24 24" className={`h-4 w-4 transition ${masOpciones ? 'rotate-180' : ''}`} {...trazo}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {/*
            LOS DETALLES, COMO UNA SECCIÓN Y NO COMO CAMPOS SUELTOS.

            Matías, mirándolo en el iPhone: «cuando abro para poner en qué,
            qué fecha y demás, se desestructura todo; es muy feo». Era eso:
            los chips de forma de pago se cortaban contra el borde, la aclaración
            del detalle quedaba pegada a la etiqueta, y la fecha y la nota
            compartían dos columnas de 160 px. Ahora todo esto vive dentro de
            un bloque con borde propio, cada cosa en su renglón, y las dos
            columnas recién aparecen cuando hay ancho para ellas.
          */}
          {masOpciones && (
            <div className="space-y-3.5 rounded-2xl border border-borde/70 bg-arena/40 p-3.5 aparecer">
              <label className="block">
                <span className="etiqueta mb-0.5">{t.pantallas.detalle}</span>
                <span className="mb-1.5 block text-[12px] leading-snug text-tinta/45">
                  {t.gastos.siNoPonesNada(categoriaDelRubro(t, categoria || 'General'))}
                </span>
                <input
                  className="campo" maxLength={120}
                  placeholder={tipo === 'gasto' ? t.gastos.ejemploGasto : t.gastos.ejemploIngreso}
                  value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
                />
              </label>

              {!conCampanas && bloqueFormaDePago}
              {!conCampanas && bloqueCuenta}
              {!conCampanas && bloqueMontoCuenta(false)}

              <div className="grid gap-3.5 sm:grid-cols-2">
                {!aCosecha && (
                  <label className="block">
                    <span className="etiqueta">{t.venta.fecha}</span>
                    <input type="date" className="campo" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                  </label>
                )}
                <label className="block">
                  <span className="etiqueta">{t.pantallas.nota}</span>
                  <input className="campo" maxLength={200} placeholder={t.venta.opcional} value={notas} onChange={(e) => setNotas(e.target.value)} />
                </label>
              </div>
            </div>
          )}

          {/* (131) Con los detalles plegados, lo de la cuenta en otra moneda
              sigue a la vista: no puede salir plata de la de dólares sin verse. */}
          {!conCampanas && !masOpciones && bloqueMontoCuenta(true)}

          {error && <p className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}

          <button className="boton-principal min-h-[52px] w-full text-[16px]" disabled={guardando || montoFinal <= 0 || avisoDelDolar === 'bloqueo' || faltaImporteCuenta}>
            {guardando
              ? t.comun.guardando
              : montoFinal > 0
                ? (aCosecha ? t.gastosCampana.aCosecha.guardarDeuda(dinero(montoFinal, moneda)) : t.gastos.guardarMonto(dinero(montoFinal, moneda)))
                : t.comun.guardar}
          </button>
        </form>
      </div>

      {/* ------------------------------ listado ------------------------------ */}
      <Seccion titulo={hayMas ? t.gastos.ultimosDelPeriodo : t.gastos.delPeriodo}>
        {movimientos.length === 0 ? (
          <Vacio titulo={t.pantallas.nadaPorAca} detalle={t.pantallas.nadaPorAcaDetalle} />
        ) : (
          <ul className="divide-y divide-borde">
            {movimientos.map((mv) => {
              const anulado = mv.estado === 'anulado';
              const v = vinculos[mv.id];
              const partes = v?.reparto_id ? repartos[v.reparto_id] ?? [] : [];
              const repartido = partes.length > 1;
              // Lo que nació dentro de una liquidación no se anula suelto:
              // se anula el papel entero desde la campaña (100).
              const sePuedeAnular = puedeAnular({ rol, userId }, mv, hoy) && conocido(mv.id) && !v?.liquidacion_id;
              const deLote = nombreLote(v?.lote_id);
              return (
                <li key={mv.id} className={`flex items-center gap-3 px-4 py-3 ${anulado ? 'bg-arena/60' : ''}`}>
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                    anulado ? 'bg-borde text-tinta/35'
                      : mv.tipo === 'gasto' ? 'bg-rojo-claro text-rojo' : 'bg-verde-claro text-verde-fuerte'
                  }`}>
                    <svg viewBox="0 0 24 24" className="h-4 w-4" {...trazo}>
                      {mv.tipo === 'gasto' ? <path d="M12 5v14M6 13l6 6 6-6" /> : <path d="M12 19V5M6 11l6-6 6 6" />}
                    </svg>
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-[14px] font-semibold ${anulado ? 'text-tinta/40 line-through' : ''}`}>
                      {mv.descripcion || t.gastos.sinDescripcion}
                    </p>
                    <p className="truncate text-[12px] text-tinta/45">
                      {anulado && <span className="font-bold text-rojo">{t.pantallas.anulado} · </span>}
                      {fechaLegible(mv.fecha, false, locale)} · {categoriaDelRubro(t, mv.categoria)} · {metodoVisible(t, mv.metodo_pago)}
                      {mv.origen !== 'manual' && ` · ${t.gastos.porVoz}`}
                      {deLote && ` · ${deLote}`}
                      {v?.liquidacion_id && ` · ${t.gastosCampana.historial.parteDeLiquidacion(mv.fecha.slice(8, 10) + '/' + mv.fecha.slice(5, 7))}`}
                      {repartido && ` · ${t.gastosCampana.historial.repartido(partes.length)}`}
                    </p>
                  </div>

                  <span className={`shrink-0 text-[14.5px] font-bold tabular-nums ${
                    anulado ? 'text-tinta/35 line-through' : mv.tipo === 'gasto' ? 'text-rojo' : 'text-verde-fuerte'
                  }`}>
                    {mv.tipo === 'gasto' ? '−' : '+'} {dinero(Number(mv.monto), moneda, false)}
                  </span>

                  {sePuedeAnular && (
                    <button
                      type="button"
                      onClick={() => (repartido ? setAAnularJuntas({ movimiento: mv, partes }) : setAAnular(mv))}
                      aria-label={repartido ? t.gastosCampana.historial.anularJuntas(partes.length) : t.pantallas.anularMovimiento}
                      title={repartido ? t.gastosCampana.historial.anularJuntas(partes.length) : t.pantallas.anular}
                      className="icono-toque shrink-0 text-tinta/25 transition hover:bg-rojo-claro hover:text-rojo"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" {...trazo}>
                        <circle cx="12" cy="12" r="8.5" /><path d="m6.5 6.5 11 11" />
                      </svg>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {hayMas && (
          <p className="border-t border-borde px-4 py-3 text-[12.5px] text-tinta/50">
            {t.gastos.seMuestranRecientes}{' '}
            {t.gastos.paraVerElResto} <a href="/movimientos" className="boton-texto">{t.gastos.historialCompleto}</a>.
          </p>
        )}
      </Seccion>

      {aAnular && (
        <DialogoAnular
          movimiento={aAnular}
          moneda={moneda}
          onCerrar={() => setAAnular(null)}
          onConfirmar={(motivo) => anular(aAnular.id, motivo)}
        />
      )}

      {/* Las partes de un gasto repartido se anulan juntas: el mismo diálogo,
          con el gasto entero. */}
      {aAnularJuntas && (
        <DialogoAnular
          movimiento={{
            ...aAnularJuntas.movimiento,
            descripcion: `${sinNumeroDeParte(aAnularJuntas.movimiento.descripcion)} · ${t.gastosCampana.historial.repartido(aAnularJuntas.partes.length)}`,
            monto: aAnularJuntas.partes.filter((p) => p.estado === 'activo').reduce((s, p) => s + p.monto, 0),
          }}
          moneda={moneda}
          onCerrar={() => setAAnularJuntas(null)}
          onConfirmar={(motivo) => anularJuntas(aAnularJuntas.partes, motivo)}
        />
      )}
    </div>
  );
}
