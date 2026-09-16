'use client';

import { useEffect, useState } from 'react';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { SelectorCliente, asegurarCliente, type ClienteElegido } from '@/components/SelectorCliente';
import { OpcionesTipo } from '@/components/OpcionesTipo';
import { dinero, decimalesDe } from '@/lib/formato';
import { mensajeDeError } from '@/lib/errores';
import { mismoNombre } from '@/lib/turno-voz';
import { useTextos } from '@/i18n/cliente';
import type { CapturaInterpretada, TipoCaptura, TipoCuenta } from '@/lib/tipos';

type Deudor = { cliente_id: string; nombre: string; saldo: number };

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
  borrador, moneda, empresaId, tipoCuenta, onCambio, onCancelar, onListo,
}: {
  borrador: CapturaInterpretada;
  moneda: string;
  empresaId: string;
  tipoCuenta: TipoCuenta;
  onCambio: (c: CapturaInterpretada) => void;
  onCancelar: () => void;
  /** Guardado. Quien la abrió cierra y refresca. */
  onListo: () => void;
}) {
  const t = useTextos();
  const dec = decimalesDe(moneda);
  const esCobro = borrador.tipo === 'cobro_fiado';
  const esPersonal = tipoCuenta === 'personal';
  const plata = (n: number) => dinero(n, moneda);

  // Un fiado nuevo: quién debe. Se elige de la lista o se crea ahí mismo.
  const [elegido, setElegido] = useState<ClienteElegido>({
    id: borrador.cliente_id ?? null, nombre: borrador.contraparte ?? '', telefono: '',
  });
  // Un cobro: tiene que ser alguien que ya debe. Se elige de los que deben.
  const [deudores, setDeudores] = useState<Deudor[] | null>(null);
  const [quien, setQuien] = useState(borrador.cliente_id ?? '');
  const [guardando, setGuardando] = useState(false);
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

  function set<K extends keyof CapturaInterpretada>(k: K, v: CapturaInterpretada[K]) {
    onCambio({ ...borrador, [k]: v });
  }

  const puede = borrador.monto > 0 && !guardando
    && (esCobro ? quien !== '' : elegido.nombre.trim() !== '');

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
        });
        if (err) throw err;
      } else {
        const cliente = await asegurarCliente(empresaId, elegido);
        if (!cliente) throw new Error(t.captura.decíQuienTeDebe);
        const { error: err } = await sb.rpc('anotar_fiado', {
          p_empresa: empresaId, p_cliente: cliente, p_monto: borrador.monto,
          p_concepto: borrador.descripcion ?? '', p_fecha: borrador.fecha || null,
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
    <div className="max-h-[78vh] overflow-y-auto scroll-limpio">
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
            {deudor && borrador.monto > deudor.saldo && (
              <p className="mt-2 rounded-xl bg-ambar-claro px-3.5 py-2.5 text-[13px] font-medium text-ambar">
                {t.captura.noSeLePuedeCobrarMas(deudor.nombre, plata(deudor.saldo))}
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
      </div>

      <div className="mt-5 rounded-2xl bg-arena p-4">
        <label className="etiqueta">{esCobro ? t.captura.cuantoTePago : t.captura.cuantoTeDebe}</label>
        <input
          type="number" inputMode="decimal" min={0} step={dec === 0 ? 1 : 0.01}
          className="campo text-[22px] font-bold tabular-nums"
          value={borrador.monto}
          onChange={(e) => set('monto', Number(e.target.value) || 0)}
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

      {error && <p className="mt-4 rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}

      <div className="mt-5 grid grid-cols-2 gap-2.5 pb-1">
        <button className="boton-suave py-3" onClick={onCancelar} disabled={guardando}>{t.captura.atras}</button>
        <button className="boton-principal py-3" onClick={guardar} disabled={!puede}>
          {guardando ? t.comun.guardando : t.comun.guardar}
        </button>
      </div>
    </div>
  );
}
