import Link from 'next/link';
import { type Moneda, dinero, fechaLegible } from '@/lib/formato';
import { Seccion, Vacio } from '@/components/Piezas';
import type { Movimiento } from '@/lib/tipos';
import type { Resumen } from '@/lib/calculos';
import type { Textos as Diccionario } from '@/i18n';
import { categoriaDelRubro } from '@/i18n/textos/gastos-campana';

/**
 * EL PANEL DE LA CUENTA PERSONAL EN EL PLAN GRATIS (110, 28/09/2026)
 *
 * Aparte del panel del Pro (`PanelPersonal`) por la misma lección que separó
 * el panel personal del de negocio: una pantalla con condicionales para
 * todos termina hablándole mal a alguien. Casi todo lo que muestra el del Pro
 * —billetera, ahorros, deudas, lo que te deben, el presupuesto— es del Pro.
 *
 * Acá va lo que la persona hace en Gratis: anotar. Cuánto entró, cuánto salió
 * y cuánto le quedó en el mes, y lo último que anotó.
 *
 * El mes sale de `resumen_financiero` (del 1 a hoy) y no de
 * `resumen_personal`: el ciclo de cobro a cobro se configura en Presupuesto,
 * que es del Pro, y el número no puede depender de algo que no se puede tocar.
 *
 * Sin hooks: lo arma el servidor, como el resto del panel.
 */
export function PanelPersonalGratis({
  resumen, ultimas, moneda, locale, t,
}: {
  resumen: Resumen;
  ultimas: Movimiento[];
  /** La vista (`ctx.vista`): acá solo se mira, no se escribe. */
  moneda: Moneda;
  locale: string;
  t: Diccionario;
}) {
  const g = t.planGratis.panel;
  const plata = (n: number) => dinero(n, moneda, true, locale);
  const entro = resumen.ingresosTotales;
  const salio = resumen.gastos;
  const teQuedo = entro - salio;
  // Gastos y ningún ingreso: un «Te quedó» negativo en rojo todo el mes le
  // mentiría a quien cobra el 30. Se dice lo que pasa, sin alarma.
  const sinIngresos = salio > 0 && entro === 0;

  return (
    <div className="space-y-4">
      {/* ---------- Este mes ---------- */}
      <section className="tarjeta overflow-hidden">
        <h2 className="px-5 pb-1 pt-4 text-[15px] font-bold tracking-tight">{g.esteMes}</h2>
        <div className="divide-y divide-borde">
          <Fila titulo={t.pantallas.entro} valor={plata(entro)} tono="bueno" />
          <Fila titulo={t.pantallas.salio} valor={plata(salio)} tono="malo" />
          {sinIngresos ? (
            <div className="px-5 py-3.5">
              <p className="text-[14.5px] font-semibold text-tinta/70">{g.sinIngresos}</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-tinta/50">
                {g.cobroACobro}{' '}
                <Link href="/plan" className="font-bold text-verde-fuerte underline">{t.planGratis.plan.verPro}</Link>
              </p>
            </div>
          ) : (
            <Fila
              titulo={t.pantallas.teQuedo}
              valor={plata(teQuedo)}
              tono={teQuedo >= 0 ? 'bueno' : 'malo'}
            />
          )}
        </div>
      </section>

      {/* ---------- Lo último que anotó ---------- */}
      <Seccion
        titulo={g.ultimas}
        accion={ultimas.length > 0
          ? <Link href="/movimientos" className="boton-texto">{g.verTodo}</Link>
          : undefined}
      >
        {ultimas.length === 0 ? (
          <div className="px-4 pb-4">
            <Vacio titulo={g.sinCargas} detalle={g.sinCargasDetalle} />
          </div>
        ) : (
          <ul className="divide-y divide-borde border-t border-borde">
            {ultimas.slice(0, 5).map((m) => {
              const categoria = categoriaDelRubro(t, m.categoria);
              const gasto = m.tipo === 'gasto';
              return (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">
                      {m.descripcion || categoria}
                    </span>
                    <span className="block truncate text-[12px] text-tinta/45">
                      {fechaLegible(m.fecha, false, locale)}
                      {m.descripcion && categoria ? ` · ${categoria}` : ''}
                    </span>
                  </span>
                  <span className={`shrink-0 text-[14.5px] font-bold tabular-nums ${gasto ? 'text-rojo' : 'text-verde-fuerte'}`}>
                    {gasto ? '−' : '+'} {dinero(Number(m.monto), moneda, false, locale)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Seccion>
    </div>
  );
}

/** Igual que la `Fila` del panel del Pro: el monto entero a la derecha. */
function Fila({
  titulo, valor, tono,
}: {
  titulo: string;
  valor: string;
  tono?: 'bueno' | 'malo';
}) {
  const color = tono === 'bueno' ? 'text-verde-fuerte' : tono === 'malo' ? 'text-rojo' : '';
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3.5">
      <span className="min-w-0 text-[14.5px] font-semibold">{titulo}</span>
      <span className={`shrink-0 text-[16px] font-bold tabular-nums tracking-tight ${color}`}>{valor}</span>
    </div>
  );
}
