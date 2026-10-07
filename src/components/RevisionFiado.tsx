'use client';

import { useEffect, useMemo, useState } from 'react';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { SelectorCliente, asegurarCliente, type ClienteElegido } from '@/components/SelectorCliente';
import { OpcionesTipo } from '@/components/OpcionesTipo';
import { CampoMonto } from '@/components/CampoMonto';
import { dinero, decimalesDe } from '@/lib/formato';
import { mensajeDeError } from '@/lib/errores';
import { mismoNombre } from '@/lib/turno-voz';
import { useTextos } from '@/i18n/cliente';
import { ElegirCuentaOpcional } from '@/components/FormaDeCobro';
import { CuandoTePaga } from '@/components/CuandoTePaga';
import { hoyISO } from '@/lib/fechas';
import { useZona } from '@/lib/zona';
import { OpcionesDeQue } from '@/components/OpcionesDeQue';
import { ajustarPlan, leerDetalleFiado, opcionesDeCobro, planValido } from '@/lib/cuotas';
import { planDeLoDictado } from '@/lib/cuotas-dictadas';
// Solo el tipo: importar un valor de `captura` traería el prompt entero al navegador.
import type { CapturaDeVoz } from '@/lib/captura';
import type { CuentaParaElegir, DetalleFiado, Plan, TipoCaptura, TipoCuenta } from '@/lib/tipos';

/** `conCuotas`: tiene alguna cuota pendiente, así que el cobro tiene que decir de cuál. */
type Deudor = { cliente_id: string; nombre: string; saldo: number; conCuotas: boolean };

/** Las formas de cobro que acepta `cobrar_fiado` (056). «A crédito» no es una. */
const FORMAS_DE_COBRO = ['efectivo', 'transferencia', 'tarjeta', 'otro'];

/**
 * «LUCAS ME DEBE 300 MIL»
 *
 * Lo que alguien te debe no es una deuda tuya ni un ingreso: es fiado, y
 * vive en su propio libro (054). Hasta acá la voz no lo conocía y lo cargaba
 * como una deuda tuya con Lucas: justo al revés.
 *
 * Tiene su propia revisión y no un puñado de `if` en la de los movimientos:
 * no lleva categoría, ni productos, ni comprobante, y lo único que importa
 * —quién— es justo lo que la otra no pregunta.
 *
 * Guarda con las mismas funciones que la pantalla de Fiado. Cobrar NO crea un
 * ingreso (056): esa plata ya se contó cuando se vendió o se prestó.
 */
export function RevisionFiado({
  borrador, moneda, empresaId, tipoCuenta, cuentas = [], onCambio, onCancelar, onListo, onOcupado,
}: {
  borrador: CapturaDeVoz;
  moneda: string;
  empresaId: string;
  tipoCuenta: TipoCuenta;
  /**
   * Las cuentas de la billetera (01/10), para decir de cuál salió lo
   * prestado o a cuál entró lo cobrado, como en la pantalla de Fiado (084).
   * Vacía para quien no administra y en el Gratis personal: no se pregunta.
   */
  cuentas?: CuentaParaElegir[];
  onCambio: (c: CapturaDeVoz) => void;
  onCancelar: () => void;
  /** Guardado. Quien la abrió cierra y refresca. */
  onListo: () => void;
  /** Mientras guarda, la captura no se cierra (ni Escape ni un toque afuera). */
  onOcupado?: (ocupada: boolean) => void;
}) {
  const t = useTextos();
  const dec = decimalesDe(moneda);
  const esCobro = borrador.tipo === 'cobro_fiado';
  const esPersonal = tipoCuenta === 'personal';
  const plata = (n: number) => dinero(n, moneda);
  const hoy = hoyISO(useZona());

  /**
   * CUÁNDO TE PAGA (127). Lo dictado («en 3 cuotas, la primera el 15») llega
   * ya armado como plan y se ve SIEMPRE antes de guardar: una fecha relativa
   * («el viernes») la calculó el modelo, y un modelo se equivoca de viernes.
   * Sin nada dictado arranca en «Sin fecha», que es el fiado de siempre.
   *
   * Solo donde la cuenta tiene la pantalla de Fiado (`con_fechas`).
   */
  const conFechas = borrador.con_fechas === true;
  const [plan, setPlan] = useState<Plan | null>(
    () => (conFechas ? planDeLoDictado(borrador.cuotas, borrador.monto, hoy, dec) : null),
  );
  // La voz dijo cuántas pero el monto llegó en cero («no pude sacar el
  // monto»): el plan se arma recién cuando la persona escribe el número.
  const [faltaArmar, setFaltaArmar] = useState(conFechas && !!borrador.cuotas && !(borrador.monto > 0));
  useEffect(() => {
    if (!faltaArmar || !(borrador.monto > 0)) return;
    setFaltaArmar(false);
    setPlan(planDeLoDictado(borrador.cuotas, borrador.monto, hoy, dec));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faltaArmar, borrador.monto]);

  // Un fiado nuevo: quién debe. Se elige de la lista o se crea ahí mismo.
  const [elegido, setElegido] = useState<ClienteElegido>({
    id: borrador.cliente_id ?? null, nombre: borrador.contraparte ?? '', telefono: '',
  });
  // Un cobro: tiene que ser alguien que ya debe. Se elige de los que deben.
  const [deudores, setDeudores] = useState<Deudor[] | null>(null);
  const [quien, setQuien] = useState(borrador.cliente_id ?? '');
  /**
   * La cuenta (084): '' = ninguna. Un préstamo dictado nunca bajaba el banco
   * y un cobro dictado nunca lo subía. Arranca en «ninguna», como en Fiado:
   * fiar mercadería no saca plata de ningún lado.
   */
  const [cuentaId, setCuentaId] = useState('');
  const [guardando, setGuardando] = useState(false);
  // La captura no se cierra a mitad de un guardado (01/10).
  useEffect(() => { onOcupado?.(guardando); }, [guardando, onOcupado]);
  useEffect(() => () => onOcupado?.(false), [onOcupado]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!esCobro || deudores !== null) return;
    let vivo = true;
    (async () => {
      try {
        const { data } = await clienteNavegador().rpc('resumen_fiado', { p_empresa: empresaId });
        const lista: Deudor[] = Array.isArray(data?.clientes)
          ? data.clientes.map((c: any) => ({
              cliente_id: String(c.cliente_id), nombre: String(c.nombre ?? ''), saldo: Number(c.saldo ?? 0),
              conCuotas: c.proxima != null,
            }))
          : [];
        if (!vivo) return;
        setDeudores(lista);
        // Si la IA no lo reconoció pero el nombre que se dijo es de uno solo
        // de los que deben, se lo marca. Con dos «Lucas», no: elige la persona.
        if (!quien && borrador.contraparte) {
          const mismos = lista.filter((d) => mismoNombre(d.nombre, borrador.contraparte ?? ''));
          if (mismos.length === 1) setQuien(mismos[0].cliente_id);
        }
      } catch {
        if (vivo) setDeudores([]);
      }
    })();
    return () => { vivo = false; };
  }, [esCobro, deudores, empresaId]);

  const deudor = deudores?.find((d) => d.cliente_id === quien) ?? null;
  const forma = FORMAS_DE_COBRO.includes(borrador.metodo_pago) ? borrador.metodo_pago : 'otro';

  /**
   * ¿DE QUÉ ES EL PAGO? (127). «Juan me pagó 150 mil»: si Juan tiene una
   * heladera en cuotas y además la libreta sin fecha, el pago tiene que
   * marcar LA CUOTA. Entrando suelto bajaría la libreta, y mañana el aviso
   * diría «Juan atrasado» cuando pagó.
   *
   * Se lee recién al elegir a alguien que tiene cuotas; a quien no las tiene
   * no se le pregunta nada y el cobro es el de siempre.
   *
   * `detalle` es de UN cliente: se guarda con su id para no mostrarle a Ana
   * las cuotas de Juan mientras llega la respuesta de Ana.
   */
  const [detalle, setDetalle] = useState<{ de: string; datos: DetalleFiado | null } | null>(null);
  const [deQue, setDeQue] = useState('todo');
  const pideCuota = esCobro && !!deudor?.conCuotas;
  useEffect(() => {
    if (!pideCuota || !quien) return;
    let vivo = true;
    (async () => {
      let datos: DetalleFiado | null = null;
      try {
        const { data, error: err } = await clienteNavegador().rpc('detalle_fiado', { p_cliente: quien });
        if (!err && data) datos = leerDetalleFiado(data);
      } catch {
        // Sin el detalle el cobro entra suelto, como hasta hoy: la base lo
        // reparte sola (primero lo sin fecha, después las cuotas por fecha).
        // Es mejor que no dejar cobrar porque falló una lectura.
      }
      if (vivo) setDetalle({ de: quien, datos });
    })();
    return () => { vivo = false; };
  }, [pideCuota, quien]);

  const detalleListo = detalle !== null && detalle.de === quien;
  const { opciones, elegida } = useMemo(
    () => (pideCuota && detalleListo && detalle?.datos
      ? opcionesDeCobro(detalle.datos)
      : { opciones: [], elegida: 'todo' }),
    [pideCuota, detalleListo, detalle],
  );
  // Lo elegido de entrada es lo de la pantalla de Fiado: la cuota atrasada o
  // de hoy. Con una diferencia, porque acá el monto ya lo DIJO: si lo dicho
  // no entra en esa deuda pero sí en lo que debe en total, es «Todo».
  useEffect(() => {
    const tope = opciones.find((o) => o.clave === elegida)?.tope ?? 0;
    setDeQue(opciones.length > 0 && borrador.monto > tope && borrador.monto <= (detalle?.datos?.saldo ?? 0) ? 'todo' : elegida);
    // Sin monto dictado se propone la cuota, como en Fiado.
    const propuesto = opciones.find((o) => o.clave === elegida)?.propuesto;
    if (!(borrador.monto > 0) && propuesto) onCambio({ ...borrador, monto: propuesto });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opciones, elegida]);
  const opcion = opciones.find((o) => o.clave === deQue) ?? null;
  const saldoDelDeudor = detalleListo && detalle?.datos ? detalle.datos.saldo : deudor?.saldo ?? 0;
  const tope = opcion ? opcion.tope : saldoDelDeudor;

  function set<K extends keyof CapturaDeVoz>(k: K, v: CapturaDeVoz[K]) {
    onCambio({ ...borrador, [k]: v });
  }

  // El plan que se manda: el de la pantalla, con los montos al total de AHORA.
  const elPlan = !esCobro && conFechas && plan ? ajustarPlan(plan, borrador.monto, dec) : null;

  const puede = borrador.monto > 0 && !guardando
    && (esCobro
      // Quien tiene cuotas no cobra hasta saber de cuál (mientras se lee).
      ? quien !== '' && (!pideCuota || detalleListo)
      : elegido.nombre.trim() !== '' && (!elPlan || planValido(elPlan, borrador.monto, dec)));

  async function guardar() {
    if (!puede) return;
    setGuardando(true);
    setError('');
    try {
      const sb = clienteNavegador();
      if (esCobro) {
        const { error: err } = await sb.rpc('cobrar_fiado', {
          p_empresa: empresaId, p_cliente: quien, p_monto: borrador.monto,
          p_metodo: forma, p_fecha: borrador.fecha || null,
          p_cuenta: cuentaId || null,
          // Con la cuota, el pago marca ESA deuda. Sin ella es el cobro de siempre.
          ...(opcion?.cuota ? { p_cuota: opcion.cuota.cuota_id } : {}),
        });
        if (err) throw err;
      } else {
        const cliente = await asegurarCliente(empresaId, elegido);
        if (!cliente) throw new Error(t.captura.decíQuienTeDebe);
        const { error: err } = await sb.rpc('anotar_fiado', {
          p_empresa: empresaId, p_cliente: cliente, p_monto: borrador.monto,
          p_concepto: borrador.descripcion ?? '', p_fecha: borrador.fecha || null,
          p_cuenta: cuentaId || null,
          // La línea y sus fechas van juntas: si el plan no cierra, la base
          // no anota nada. Sin plan no viaja la clave y es el fiado de hoy.
          ...(elPlan ? { p_plan: elPlan } : {}),
        });
        if (err) throw err;
      }
      onListo();
    } catch (e: unknown) {
      setError(mensajeDeError(e, t.captura.noSePudoGuardar));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[19px] font-bold tracking-tight">{t.captura.revisar}</h2>
          <p className="mt-0.5 text-[13.5px] text-tinta/55">{t.captura.podesCorregir}</p>
        </div>
        <span className={`pastilla shrink-0 ${esCobro ? 'bg-verde-claro text-verde-fuerte' : 'bg-ambar-claro text-ambar'}`}>
          {esCobro ? t.captura.tipoTePagaron : t.captura.tipoTeDeben}
        </span>
      </div>

      {borrador.transcripcion && (
        <p className="mb-4 rounded-xl bg-arena px-3.5 py-2.5 text-[13px] italic leading-relaxed text-tinta/60">
          &laquo;{borrador.transcripcion}&raquo;
        </p>
      )}
      {borrador.aviso && (
        <p className="mb-4 rounded-xl bg-ambar-claro px-3.5 py-2.5 text-[13px] font-medium text-ambar">{borrador.aviso}</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        {/* Si la IA se equivocó de tipo, se cambia acá y pasa a la revisión
            que corresponde. */}
        <div className="col-span-2">
          <label className="etiqueta">{t.captura.campoTipo}</label>
          <select
            className="campo" value={borrador.tipo}
            onChange={(e) => onCambio({ ...borrador, tipo: e.target.value as TipoCaptura })}
          >
            <OpcionesTipo tipoCuenta={tipoCuenta} />
          </select>
        </div>

        {esCobro ? (
          <div className="col-span-2">
            <label className="etiqueta">{t.captura.quienTePago}</label>
            {deudores === null ? (
              <p className="py-2 text-[13px] text-tinta/45">{t.comun.cargando}</p>
            ) : deudores.length === 0 ? (
              <p className="rounded-xl bg-ambar-claro px-3.5 py-2.5 text-[13px] font-medium text-ambar">
                {t.captura.nadieTeDebe}
              </p>
            ) : (
              <select className="campo" value={quien} onChange={(e) => setQuien(e.target.value)}>
                <option value="">{t.captura.elegiUna}</option>
                {deudores.map((d) => (
                  <option key={d.cliente_id} value={d.cliente_id}>{d.nombre} — {t.captura.debe(plata(d.saldo))}</option>
                ))}
              </select>
            )}
            {/* ¿De qué? Solo si tiene deudas con cuotas: una opción por deuda
                con la cuota que le toca, lo sin fecha y todo. */}
            {pideCuota && !detalleListo && (
              <p className="mt-2 py-1 text-[13px] text-tinta/45">{t.comun.cargando}</p>
            )}
            {opciones.length > 0 && (
              <label className="mt-3 block">
                <span className="etiqueta">{t.fiado.deQue}</span>
                <select className="campo" value={deQue} disabled={guardando} onChange={(e) => setDeQue(e.target.value)}>
                  <OpcionesDeQue opciones={opciones} plata={plata} hoy={hoy} />
                </select>
              </label>
            )}
            {/* El tope, dicho antes de que la base lo rechace. */}
            {deudor && borrador.monto > tope && (
              <p className="mt-2 rounded-xl bg-ambar-claro px-3.5 py-2.5 text-[13px] font-medium text-ambar">
                {opcion?.tipo === 'deuda'
                  ? t.fiado.deEsaFaltan(plata(tope))
                  : t.captura.noSeLePuedeCobrarMas(deudor.nombre, plata(saldoDelDeudor))}
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="col-span-2">
              <SelectorCliente
                empresaId={empresaId}
                valor={elegido}
                alElegir={setElegido}
                etiqueta={t.captura.quienTeDebe}
                placeholder={t.captura.nombreQuienTeDebe}
                ayudaTelefono={t.venta.telefonoParaCobrar}
                pedirTelefono
                obligatorio
              />
            </div>
            <div className="col-span-2">
              <label className="etiqueta">
                {t.captura.porQueTeDebe} <span className="font-normal text-tinta/40">{t.captura.opcional}</span>
              </label>
              <input
                className="campo" maxLength={200} placeholder={t.captura.porQueTeDebeEjemplo}
                value={borrador.descripcion} onChange={(e) => set('descripcion', e.target.value)}
              />
            </div>
          </>
        )}

        <div>
          <label className="etiqueta">{t.captura.campoFecha}</label>
          <input type="date" className="campo" value={borrador.fecha ?? ''} onChange={(e) => set('fecha', e.target.value)} />
        </div>

        {/* La fecha de arriba es CUÁNDO se fió; esto, cuándo te paga. Va
            siempre a la vista, entendido o no: se corrige con un toque. */}
        {!esCobro && conFechas && (
          <div className="col-span-2 min-w-0">
            {borrador.cuotas && borrador.cuotas.cantidad > 1 && plan?.length === borrador.cuotas.cantidad && (
              <p className="mb-2 text-[12.5px] font-medium text-tinta/55">
                {t.captura.cuotasEntendidas(borrador.cuotas.cantidad)}
              </p>
            )}
            <CuandoTePaga
              total={borrador.monto} hoy={hoy} moneda={moneda}
              valor={plan} alCambiar={setPlan} deshabilitado={guardando}
            />
          </div>
        )}

        {esCobro && (
          <div>
            <label className="etiqueta">{t.captura.comoTePago}</label>
            <select className="campo" value={forma} onChange={(e) => set('metodo_pago', e.target.value)}>
              <option value="efectivo">{t.captura.metodoEfectivo}</option>
              <option value="transferencia">{t.captura.metodoTransferencia}</option>
              <option value="tarjeta">{t.captura.metodoTarjeta}</option>
              <option value="otro">{t.captura.metodoOtro}</option>
            </select>
          </div>
        )}

        <div className="col-span-2 empty:hidden">
          {esCobro ? (
            <ElegirCuentaOpcional
              cuentas={cuentas} elegida={cuentaId} alElegir={setCuentaId} deshabilitado={guardando}
              pregunta={t.fiado.enQueCuentaEntro} ninguna={t.fiado.noEntroEnNinguna}
            />
          ) : (
            <ElegirCuentaOpcional
              cuentas={cuentas} elegida={cuentaId} alElegir={setCuentaId} deshabilitado={guardando}
              pregunta={t.fiado.salioDeTuBilletera} ninguna={t.fiado.noSalioPlata}
              detalle={cuentaId === '' ? t.fiado.noSalioPlataDetalle : t.fiado.salioDetalle}
            />
          )}
        </div>
      </div>

      <div className="mt-5 rounded-2xl bg-arena p-4">
        <label className="etiqueta">{esCobro ? t.captura.cuantoTePago : t.captura.cuantoTeDebe}</label>
        <CampoMonto
          decimales={dec}
          className="campo text-[22px] font-titulo font-extrabold"
          valor={borrador.monto}
          alCambiar={(n) => set('monto', n)}
        />
        <p className="mt-1.5 text-[13px] text-tinta/50">{plata(borrador.monto)}</p>
      </div>

      {/* Qué pasa con la plata, dicho antes de guardar: que no sume como
          ingreso es justo lo que nadie espera. */}
      <p className="mt-3 text-[12.5px] leading-snug text-tinta/50">
        {esCobro
          ? t.captura.cobroNoEsIngreso
          : t.captura.fiadoNoEsIngreso(esPersonal ? t.nav.meDeben : t.nav.fiado)}
      </p>

      {error && <p role="alert" className="mt-4 rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}

      {/* Pegado abajo de la tarjeta de la captura (globals.css, `.pie-captura`). */}
      <div className="pie-captura">
        <button className="boton-suave py-3" onClick={onCancelar} disabled={guardando}>{t.captura.atras}</button>
        <button className="boton-principal py-3" onClick={guardar} disabled={!puede}>
          {guardando ? t.comun.guardando : t.comun.guardar}
        </button>
      </div>
    </div>
  );
}
