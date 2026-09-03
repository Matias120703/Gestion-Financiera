'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { dinero, fechaLegible } from '@/lib/formato';
import { useTextos, useLocale } from '@/i18n/cliente';
import { Seccion, Vacio } from '@/components/Piezas';
import type {
  Profesional, Reparto, ResumenReparto, FilaLiquidacion, MisServicios,
  Producto, Miembro,
} from '@/lib/tipos';

/**
 * EQUIPO Y REPARTO
 *
 * El orden de la pantalla es el orden de las preguntas del dueño:
 *
 *   1. ¿Cuánto me quedó y de dónde salió?   → el desglose
 *   2. ¿Cuánto le tengo que pagar a cada uno? → la liquidación
 *   3. ¿Quiénes son y cómo arreglé con ellos? → el equipo
 *
 * El desglose va primero porque es el número que se mira todos los días; el
 * equipo va último porque se toca una vez y no se vuelve a mirar en meses.
 */

type Equipo = Pick<Miembro, 'user_id' | 'nombre' | 'rol'>[];

export function PantallaReparto({
  empresaId, moneda, profesionales, resumen, liquidacion, servicios, precios, equipo, desde, hasta,
}: {
  empresaId: string;
  moneda: string;
  profesionales: Profesional[];
  resumen: ResumenReparto;
  liquidacion: FilaLiquidacion[];
  servicios: Producto[];
  precios: { profesional_id: string; producto_id: string; precio: number }[];
  equipo: Equipo;
  desde: string;
  hasta: string;
}) {
  const t = useTextos();
  const locale = useLocale();
  const router = useRouter();
  const [trabajando, setTrabajando] = useState('');
  const [error, setError] = useState('');

  const plata = (n: number) => dinero(n, moneda, true, locale);
  const ocupado = trabajando !== '';
  const sb = () => clienteNavegador();

  async function correr(marca: string, fn: () => Promise<{ error: unknown } | void>) {
    setTrabajando(marca);
    setError('');
    try {
      const r = await fn();
      const fallo = r && typeof r === 'object' && 'error' in r ? r.error : null;
      if (fallo) throw fallo;
      router.refresh();
    } catch (e: unknown) {
      const mensaje = e && typeof e === 'object' && 'message' in e
        ? String((e as { message: unknown }).message)
        : t.comun.error;
      setError(mensaje);
    } finally {
      setTrabajando('');
    }
  }

  const periodo = desde === hasta
    ? fechaLegible(desde, true, locale)
    : `${fechaLegible(desde, false, locale)} — ${fechaLegible(hasta, true, locale)}`;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {error && (
        <p role="alert" className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">
          {error}
        </p>
      )}

      {/* ---------- 1 · de dónde salió lo tuyo ---------- */}
      <section className="tarjeta p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[16px] font-bold tracking-tight">{t.reparto.deDondeSalio}</h2>
          <span className="text-[12.5px] text-tinta/45">{periodo}</span>
        </div>

        <div className="mt-3 divide-y divide-borde border-t border-borde">
          <Renglon
            etiqueta={t.reparto.misCortes}
            detalle={t.reparto.misCortesDetalle}
            valor={plata(resumen.mis_cortes)}
          />
          <Renglon
            etiqueta={t.reparto.deMiEquipo}
            detalle={t.reparto.deMiEquipoDetalle}
            valor={plata(resumen.de_mi_equipo)}
          />
          <Renglon
            etiqueta={t.reparto.mercaderia}
            detalle={t.reparto.mercaderiaDetalle}
            valor={plata(resumen.mercaderia)}
          />
          {resumen.otros_ingresos !== 0 && (
            <Renglon
              etiqueta={t.reparto.otrosIngresos}
              detalle={t.reparto.otrosIngresosDetalle}
              valor={plata(resumen.otros_ingresos)}
            />
          )}
        </div>

        <div className="mt-3 flex items-baseline justify-between gap-3 rounded-xl bg-verde-claro px-3.5 py-3">
          <span className="text-[14px] font-semibold text-verde-fuerte">
            {t.reparto.totalTuyo}
            <span className="ml-1.5 font-normal text-tinta/45">· {t.reparto.antesDeGastos}</span>
          </span>
          <span className="shrink-0 text-[17px] font-bold tabular-nums text-verde-fuerte">
            {plata(resumen.total)}
          </span>
        </div>

        {/* Que el desglose cierre con el panel no es un detalle: si no
            coincidiera, habría que elegir a cuál de los dos creerle. */}
        <p className="mt-2 text-[12px] leading-snug text-tinta/45">{t.reparto.cierraConElPanel}</p>
      </section>

      {/* ---------- 2 · cobrar un servicio ---------- */}
      <CobrarServicio
        profesionales={profesionales.filter((p) => p.activo)}
        servicios={servicios}
        precios={precios}
        moneda={moneda}
        ocupado={ocupado}
        alCobrar={(d) => correr('cobrar', async () => sb().rpc('registrar_servicio', {
          p_empresa: empresaId,
          p_profesional: d.profesional,
          p_producto: d.servicio,
          p_precio: d.precio,
          p_cliente: d.cliente,
        }))}
      />

      {/* ---------- 3 · la liquidación ---------- */}
      <Seccion titulo={t.reparto.liquidacion}>
        <p className="px-4 pb-2 text-[12.5px] leading-relaxed text-tinta/50">
          {t.reparto.liquidacionDetalle}
        </p>
        {liquidacion.length === 0 ? (
          <div className="px-4 pb-4">
            <Vacio titulo={t.reparto.sinEquipo} detalle={t.reparto.sinEquipoDetalle} />
          </div>
        ) : (
          <ul className="divide-y divide-borde border-t border-borde">
            {liquidacion.map((f) => (
              <FilaPersona
                key={f.id}
                fila={f}
                moneda={moneda}
                ocupado={ocupado}
                alPagar={(monto) => correr('pagar', async () => sb().rpc('pagar_profesional', {
                  p_empresa: empresaId,
                  p_profesional: f.id,
                  p_monto: monto,
                }))}
              />
            ))}
          </ul>
        )}
      </Seccion>

      {/* ---------- 4 · el equipo ---------- */}
      <Equipo
        profesionales={profesionales}
        equipo={equipo}
        ocupado={ocupado}
        alGuardar={(d) => correr('equipo', async () => sb().rpc('guardar_profesional', {
          p_empresa: empresaId,
          p_nombre: d.nombre,
          p_reparto: d.reparto,
          p_porcentaje: d.porcentaje,
          p_user: d.user_id,
          p_id: d.id ?? null,
        }))}
        alQuitar={(id) => correr('equipo', async () => sb().rpc('borrar_profesional', {
          p_empresa: empresaId,
          p_id: id,
        }))}
      />
    </div>
  );
}

function Renglon({ etiqueta, detalle, valor }: { etiqueta: string; detalle: string; valor: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold">{etiqueta}</span>
        <span className="mt-0.5 block text-[12px] leading-snug text-tinta/45">{detalle}</span>
      </span>
      <span className="shrink-0 text-[15px] font-semibold tabular-nums">{valor}</span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// COBRAR UN SERVICIO
//
// El número que importa se muestra ANTES de guardar: cuánto se lleva el
// profesional y cuánto queda en el local. Si el reparto apareciera recién
// después, la primera vez que alguien cobre va a dudar de si entendió bien —
// y con la plata de otro, dudar una vez alcanza para no volver a usarlo.
// ════════════════════════════════════════════════════════════
function CobrarServicio({
  profesionales, servicios, precios, moneda, ocupado, alCobrar,
}: {
  profesionales: Profesional[];
  servicios: Producto[];
  precios: { profesional_id: string; producto_id: string; precio: number }[];
  moneda: string;
  ocupado: boolean;
  alCobrar: (d: { profesional: string; servicio: string; precio: number; cliente: string }) => void;
}) {
  const t = useTextos();
  const locale = useLocale();
  const [abierto, setAbierto] = useState(false);
  const [profesional, setProfesional] = useState(profesionales[0]?.id ?? '');
  const [servicio, setServicio] = useState(servicios[0]?.id ?? '');
  const [precio, setPrecio] = useState('');
  const [cliente, setCliente] = useState('');

  const plata = (n: number) => dinero(n, moneda, true, locale);
  const quien = profesionales.find((p) => p.id === profesional);

  // El precio propio manda sobre el del catálogo. Es la misma regla que en la
  // base, y acá se repite para poder mostrar el número antes de guardar.
  const delCatalogo = servicios.find((s) => s.id === servicio)?.precio ?? 0;
  const propio = precios.find((p) => p.profesional_id === profesional && p.producto_id === servicio);
  const sugerido = propio ? Number(propio.precio) : Number(delCatalogo);

  const escrito = Number(precio.replace(',', '.'));
  const monto = escrito > 0 ? escrito : sugerido;

  const paraElProfesional = !quien ? 0
    : quien.reparto === 'alquiler' ? monto
    : quien.reparto === 'comision' ? Math.round(monto * Number(quien.porcentaje ?? 0) / 100)
    : 0;
  const paraElLocal = monto - paraElProfesional;

  const valido = profesional !== '' && servicio !== '' && monto > 0;

  if (servicios.length === 0) {
    return (
      <Seccion titulo={t.reparto.cobrar}>
        <div className="px-4 pb-4">
          <Vacio titulo={t.reparto.cobrar} detalle={t.reparto.sinServicios} />
        </div>
      </Seccion>
    );
  }

  return (
    <Seccion
      titulo={t.reparto.cobrar}
      accion={
        <button type="button" className="boton-texto" onClick={() => setAbierto((v) => !v)} disabled={ocupado}>
          {abierto ? t.comun.cancelar : t.reparto.cobrar}
        </button>
      }
    >
      {abierto && (
        <div className="space-y-3 border-t border-borde px-4 pb-4 pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="etiqueta" htmlFor="rep-quien">{t.reparto.quienAtendio}</label>
              <select
                id="rep-quien" className="campo" value={profesional}
                onChange={(e) => setProfesional(e.target.value)}
              >
                {profesionales.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="etiqueta" htmlFor="rep-servicio">{t.reparto.queServicio}</label>
              <select
                id="rep-servicio" className="campo" value={servicio}
                onChange={(e) => setServicio(e.target.value)}
              >
                {servicios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="etiqueta" htmlFor="rep-precio">
                {t.reparto.precioSugerido} <span className="font-normal text-tinta/40">· {moneda}</span>
              </label>
              <input
                id="rep-precio" className="campo" inputMode="decimal"
                placeholder={String(sugerido)}
                value={precio} onChange={(e) => setPrecio(e.target.value.replace(/[^\d.,]/g, ''))}
              />
            </div>
            <div>
              <label className="etiqueta" htmlFor="rep-cliente">
                {t.reparto.aQuien} <span className="font-normal text-tinta/40">· {t.registro.opcional}</span>
              </label>
              <input
                id="rep-cliente" className="campo" maxLength={80}
                placeholder={t.reparto.aQuienEjemplo}
                value={cliente} onChange={(e) => setCliente(e.target.value)}
              />
            </div>
          </div>

          {quien && monto > 0 && (
            <div className="rounded-xl bg-arena px-3.5 py-3 text-[13px] leading-relaxed">
              {quien.reparto === 'alquiler' ? (
                <p className="font-medium text-ambar">{t.reparto.noEntraALaCaja}</p>
              ) : (
                <>
                  <p className="font-semibold">{t.reparto.seLleva(quien.nombre, plata(paraElProfesional))}</p>
                  <p className="mt-0.5 text-verde-fuerte">{t.reparto.quedaEnElLocal(plata(paraElLocal))}</p>
                </>
              )}
            </div>
          )}

          <button
            type="button" className="boton-principal w-full py-2.5"
            disabled={ocupado || !valido}
            onClick={() => {
              alCobrar({ profesional, servicio, precio: escrito > 0 ? escrito : 0, cliente: cliente.trim() });
              setPrecio('');
              setCliente('');
              setAbierto(false);
            }}
          >
            {ocupado ? t.comun.guardando : t.reparto.cobrar}
          </button>
        </div>
      )}
    </Seccion>
  );
}

// ════════════════════════════════════════════════════════════
// LA LIQUIDACIÓN
// ════════════════════════════════════════════════════════════
function FilaPersona({
  fila, moneda, ocupado, alPagar,
}: {
  fila: FilaLiquidacion;
  moneda: string;
  ocupado: boolean;
  alPagar: (monto: number) => void;
}) {
  const t = useTextos();
  const locale = useLocale();
  const [pagando, setPagando] = useState(false);
  const [monto, setMonto] = useState('');
  const plata = (n: number) => dinero(n, moneda, true, locale);

  const debe = Number(fila.le_debe);

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="text-[14.5px] font-semibold">{fila.nombre}</span>
          <EtiquetaReparto reparto={fila.reparto} porcentaje={fila.porcentaje} />
        </span>
        <span className={`text-[15px] font-bold tabular-nums ${debe > 0 ? 'text-rojo' : 'text-tinta/45'}`}>
          {debe > 0 ? plata(debe) : t.reparto.alDia}
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[12.5px] text-tinta/55">
        <span>{t.reparto.colServicios}: <b className="tabular-nums">{fila.cortes}</b></span>
        <span>{t.reparto.colCobrado}: <b className="tabular-nums">{plata(Number(fila.cobrado))}</b></span>
        <span>{t.reparto.colLeToca}: <b className="tabular-nums">{plata(Number(fila.le_toca))}</b></span>
        {Number(fila.pagado) > 0 && (
          <span>{t.reparto.colPagado}: <b className="tabular-nums">{plata(Number(fila.pagado))}</b></span>
        )}
      </div>

      {debe > 0 && (
        pagando ? (
          <div className="mt-2.5 flex flex-wrap items-end gap-2">
            <div className="min-w-[140px] flex-1">
              <label className="etiqueta">{t.reparto.cuantoLePagas}</label>
              <input
                className="campo py-2 text-[14px]" inputMode="decimal" autoFocus
                placeholder={String(debe)}
                value={monto} onChange={(e) => setMonto(e.target.value.replace(/[^\d.,]/g, ''))}
              />
            </div>
            <button
              type="button" className="boton-suave px-3 py-2 text-[13px]"
              onClick={() => { setPagando(false); setMonto(''); }} disabled={ocupado}
            >
              {t.comun.cancelar}
            </button>
            <button
              type="button" className="boton-principal px-4 py-2 text-[13px]"
              disabled={ocupado}
              onClick={() => {
                const n = Number(monto.replace(',', '.'));
                alPagar(n > 0 ? n : debe);
                setPagando(false);
                setMonto('');
              }}
            >
              {t.comun.guardar}
            </button>
          </div>
        ) : (
          <button
            type="button" className="boton-suave mt-2.5 px-3 py-1.5 text-[13px]"
            onClick={() => setPagando(true)} disabled={ocupado}
          >
            {t.reparto.pagar}
          </button>
        )
      )}
    </li>
  );
}

function EtiquetaReparto({ reparto, porcentaje }: { reparto: Reparto; porcentaje: number | null }) {
  const t = useTextos();
  const texto = reparto === 'comision' ? `${Number(porcentaje ?? 0)}%`
    : reparto === 'alquiler' ? t.reparto.repartoAlquiler
    : reparto === 'sueldo' ? t.reparto.repartoSueldo
    : t.reparto.repartoLocal;
  const tono = reparto === 'alquiler' ? 'bg-ambar-claro text-ambar' : 'bg-arena text-tinta/55';
  return <span className={`pastilla shrink-0 ${tono}`}>{texto}</span>;
}

// ════════════════════════════════════════════════════════════
// EL EQUIPO
// ════════════════════════════════════════════════════════════
type DatosProfesional = {
  id?: string;
  nombre: string;
  reparto: Reparto;
  porcentaje: number | null;
  user_id: string | null;
};

function Equipo({
  profesionales, equipo, ocupado, alGuardar, alQuitar,
}: {
  profesionales: Profesional[];
  equipo: Equipo;
  ocupado: boolean;
  alGuardar: (d: DatosProfesional) => void;
  alQuitar: (id: string) => void;
}) {
  const t = useTextos();
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<Profesional | null>(null);

  const cerrar = () => { setCreando(false); setEditando(null); };

  return (
    <Seccion
      titulo={t.reparto.equipo}
      accion={
        profesionales.length > 0 ? (
          <button
            type="button" className="boton-texto"
            onClick={() => { setEditando(null); setCreando(true); }} disabled={ocupado}
          >
            {t.reparto.agregar}
          </button>
        ) : undefined
      }
    >
      <p className="px-4 pb-2 text-[12.5px] leading-relaxed text-tinta/50">{t.reparto.intro}</p>

      {profesionales.length === 0 ? (
        <div className="px-4 pb-4">
          <Vacio titulo={t.reparto.sinEquipo} detalle={t.reparto.sinEquipoDetalle} />
          {!creando && (
            <button
              type="button" className="boton-suave w-full py-2.5"
              onClick={() => setCreando(true)} disabled={ocupado}
            >
              {t.reparto.agregar}
            </button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-borde border-t border-borde">
          {profesionales.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <button
                type="button" className="min-w-0 flex-1 text-left"
                onClick={() => { setCreando(false); setEditando(p); }} disabled={ocupado}
              >
                <span className="flex items-center gap-2">
                  <span className={`truncate text-[14px] font-semibold ${p.activo ? '' : 'text-tinta/40 line-through'}`}>
                    {p.nombre}
                  </span>
                  <EtiquetaReparto reparto={p.reparto} porcentaje={p.porcentaje} />
                </span>
                {!p.user_id && (
                  <span className="mt-0.5 block text-[12px] text-tinta/45">{t.reparto.sinCuenta}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {(creando || editando) && (
        <div className="border-t border-borde bg-arena/50 px-4 py-4">
          <FormularioProfesional
            persona={editando}
            equipo={equipo}
            ocupado={ocupado}
            alCerrar={cerrar}
            alGuardar={(d) => { alGuardar(d); cerrar(); }}
            alQuitar={editando ? () => {
              if (confirm(t.reparto.confirmarQuitar(editando.nombre))) { alQuitar(editando.id); cerrar(); }
            } : undefined}
          />
        </div>
      )}
    </Seccion>
  );
}

function FormularioProfesional({
  persona, equipo, ocupado, alCerrar, alGuardar, alQuitar,
}: {
  persona: Profesional | null;
  equipo: Equipo;
  ocupado: boolean;
  alCerrar: () => void;
  alGuardar: (d: DatosProfesional) => void;
  alQuitar?: () => void;
}) {
  const t = useTextos();
  const [nombre, setNombre] = useState(persona?.nombre ?? '');
  const [reparto, setReparto] = useState<Reparto>(persona?.reparto ?? 'comision');
  const [porcentaje, setPorcentaje] = useState(persona?.porcentaje ? String(persona.porcentaje) : '50');
  const [userId, setUserId] = useState(persona?.user_id ?? '');

  const pct = Number(porcentaje.replace(',', '.'));
  const valido = nombre.trim() !== '' && (reparto !== 'comision' || (pct > 0 && pct <= 100));

  const OPCIONES: { clave: Reparto; titulo: string; detalle: string }[] = [
    { clave: 'comision', titulo: t.reparto.repartoComision, detalle: t.reparto.repartoComisionDetalle },
    { clave: 'local', titulo: t.reparto.repartoLocal, detalle: t.reparto.repartoLocalDetalle },
    { clave: 'alquiler', titulo: t.reparto.repartoAlquiler, detalle: t.reparto.repartoAlquilerDetalle },
    { clave: 'sueldo', titulo: t.reparto.repartoSueldo, detalle: t.reparto.repartoSueldoDetalle },
  ];

  return (
    <div className="space-y-3">
      <div>
        <label className="etiqueta" htmlFor="prof-nombre">{t.reparto.nombrePersona}</label>
        <input
          id="prof-nombre" className="campo" maxLength={60} autoFocus
          placeholder={t.reparto.nombreEjemplo}
          value={nombre} onChange={(e) => setNombre(e.target.value)}
        />
      </div>

      <div>
        <span className="etiqueta">{t.reparto.comoSeReparte}</span>
        <div className="mt-1 space-y-2">
          {OPCIONES.map((o) => (
            <label
              key={o.clave}
              className={`flex cursor-pointer gap-2.5 rounded-xl border p-3 ${
                reparto === o.clave ? 'border-verde bg-verde-claro' : 'border-borde bg-white'
              }`}
            >
              <input
                type="radio" name="reparto" className="mt-0.5" value={o.clave}
                checked={reparto === o.clave}
                onChange={() => setReparto(o.clave)}
              />
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold">{o.titulo}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-tinta/55">{o.detalle}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {reparto === 'comision' && (
        <div>
          <label className="etiqueta" htmlFor="prof-pct">
            {t.reparto.cuantoSeLleva} <span className="font-normal text-tinta/40">· %</span>
          </label>
          <input
            id="prof-pct" className="campo max-w-[120px]" inputMode="decimal"
            value={porcentaje} onChange={(e) => setPorcentaje(e.target.value.replace(/[^\d.,]/g, ''))}
          />
        </div>
      )}

      <div>
        <label className="etiqueta" htmlFor="prof-cuenta">{t.reparto.cuentaDeOrden}</label>
        <select
          id="prof-cuenta" className="campo" value={userId}
          onChange={(e) => setUserId(e.target.value)}
        >
          <option value="">{t.reparto.sinCuenta}</option>
          {equipo.map((m) => (
            <option key={m.user_id} value={m.user_id}>{m.nombre}</option>
          ))}
        </select>
        <p className="mt-1.5 text-[12px] leading-snug text-tinta/45">{t.reparto.cuentaDetalle}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="boton-suave flex-1 py-2.5" onClick={alCerrar} disabled={ocupado}>
          {t.comun.cancelar}
        </button>
        <button
          type="button" className="boton-principal flex-1 py-2.5"
          disabled={ocupado || !valido}
          onClick={() => alGuardar({
            id: persona?.id,
            nombre: nombre.trim(),
            reparto,
            porcentaje: reparto === 'comision' ? pct : null,
            user_id: userId === '' ? null : userId,
          })}
        >
          {ocupado ? t.comun.guardando : t.comun.guardar}
        </button>
      </div>

      {alQuitar && (
        <button
          type="button"
          className="w-full py-1.5 text-[12.5px] font-semibold text-tinta/40 hover:text-rojo"
          onClick={alQuitar} disabled={ocupado}
        >
          {t.reparto.quitar}
        </button>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// LO QUE VE EL PROFESIONAL
//
// Sus servicios y su parte. El margen del local no está escondido con un
// `if`: la función de la base no lo devuelve.
// ════════════════════════════════════════════════════════════
export function MisServiciosPantalla({
  datos, moneda, desde, hasta,
}: {
  datos: MisServicios;
  moneda: string;
  desde: string;
  hasta: string;
}) {
  const t = useTextos();
  const locale = useLocale();
  const plata = (n: number) => dinero(n, moneda, true, locale);

  const periodo = desde === hasta
    ? fechaLegible(desde, true, locale)
    : `${fechaLegible(desde, false, locale)} — ${fechaLegible(hasta, true, locale)}`;

  if (!datos.es_profesional) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="tarjeta">
          <Vacio titulo={t.reparto.loMio} detalle={t.reparto.sinCortes} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <section className="tarjeta p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[16px] font-bold tracking-tight">{t.reparto.loMio}</h2>
          <span className="text-[12.5px] text-tinta/45">{periodo}</span>
        </div>
        <p className="mt-1 text-[12.5px] text-tinta/50">{t.reparto.loMioDetalle}</p>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <Cifra titulo={t.reparto.meCorresponde} valor={plata(Number(datos.le_toca))} />
          <Cifra titulo={t.reparto.yaCobre} valor={plata(Number(datos.pagado))} />
          <Cifra
            titulo={t.reparto.meDeben}
            valor={plata(Number(datos.le_deben))}
            tono={Number(datos.le_deben) > 0 ? 'text-verde-fuerte' : undefined}
          />
        </div>
      </section>

      <Seccion titulo={t.reparto.colServicios}>
        {datos.cortes.length === 0 ? (
          <div className="px-4 pb-4">
            <Vacio titulo={t.reparto.colServicios} detalle={t.reparto.sinCortes} />
          </div>
        ) : (
          <ul className="divide-y divide-borde border-t border-borde">
            {datos.cortes.map((c, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold">{c.servicio}</span>
                  <span className="mt-0.5 block text-[12px] text-tinta/45">
                    {fechaLegible(c.fecha, false, locale)} · {plata(Number(c.monto))}
                  </span>
                </span>
                <span className="shrink-0 text-[14.5px] font-bold tabular-nums text-verde-fuerte">
                  {plata(Number(c.tuyo))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Seccion>
    </div>
  );
}

function Cifra({ titulo, valor, tono }: { titulo: string; valor: string; tono?: string }) {
  return (
    <div className="rounded-xl bg-arena px-3 py-2.5">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-tinta/45">{titulo}</p>
      <p className={`mt-0.5 text-[15px] font-bold tabular-nums ${tono ?? ''}`}>{valor}</p>
    </div>
  );
}
