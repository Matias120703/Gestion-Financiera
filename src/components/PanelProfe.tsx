import Link from 'next/link';
import { type Moneda, dinero, dineroCorto } from '@/lib/formato';
import { Indicador, Seccion, Barra } from '@/components/Piezas';
import { categoriaVisible } from '@/i18n/nombres';
import type { Textos } from '@/i18n/textos/es';
import type { PanelProfe as Datos } from '@/lib/tipos';
import type { FilaCategoria } from '@/lib/calculos';

/**
 * LO QUE MIRA UN PROFE AL ABRIR ORDEN (092).
 *
 * Matías: «si entro como profesor no me puede aparecer lo vendido, ganancia
 * bruta, ganancia neta, lo que más se vendió. Tiene que estar adaptado a su
 * rubro».
 *
 * Un profe no vende cosas ni tiene margen sobre mercadería. Sus preguntas
 * son: ¿qué clases tengo hoy?, ¿cuánto cobré?, ¿quién me debe?, ¿cuántos
 * alumnos tengo activos?, ¿en qué se me fue la plata? Eso, y nada más.
 */
export function PanelProfe({
  datos, categorias, moneda, locale, t, rangoTexto,
}: {
  datos: Datos;
  categorias: FilaCategoria[];
  moneda: Moneda;
  locale: string;
  t: Textos;
  rangoTexto: string;
}) {
  const p = t.panel;
  const plata = (n: number) => dinero(n, moneda, true, locale);
  const corta = (n: number) => dineroCorto(n, moneda);
  const queda = Number(datos.cobrado) - Number(datos.gastado);

  return (
    <>
      {/* ---------------- Las clases de hoy ---------------- */}
      <Seccion
        titulo={p.clasesDeHoy}
        accion={<Link href="/agenda" className="boton-texto">{p.verAgenda}</Link>}
      >
        {datos.hoy.length === 0 ? (
          <p className="px-4 pb-4 pt-3 text-[13.5px] text-tinta/55">{p.sinClasesHoy}</p>
        ) : (
          <ul className="divide-y divide-borde">
            {datos.hoy.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                {/* La materia debajo del nombre y no al lado: en un celular, al
                    lado, el nombre se partía en tres renglones angostos. */}
                <span className="flex min-w-0 items-baseline gap-3">
                  <span className="shrink-0 text-[15px] font-bold tabular-nums">{c.hora}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14.5px] font-semibold">{c.alumno}</span>
                    {c.materia && <span className="block truncate text-[12.5px] text-tinta/50">{c.materia}</span>}
                  </span>
                </span>
                {c.estado === 'atendida' && (
                  <span className="pastilla shrink-0 whitespace-nowrap bg-verde text-sobre-verde">{t.agenda.claseDada}</span>
                )}
                {c.estado === 'no_vino' && (
                  <span className="pastilla shrink-0 whitespace-nowrap bg-rojo-claro text-rojo">{t.agenda.claseNoTenida}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <p className="text-[13px] font-semibold text-tinta/45">{rangoTexto}</p>

      {/* ---------------- Los números del período ---------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          titulo={p.cobrado} destacado
          valor={corta(Number(datos.cobrado))}
          detalle={p.clasesDadas(datos.clases_periodo)}
          tono="bueno"
        />
        <Indicador
          titulo={p.gastadoProfe}
          valor={corta(Number(datos.gastado))}
          detalle={categorias[0] ? p.mayorGasto(categoriaVisible(t, categorias[0].nombre).slice(0, 22)) : p.sinGastos}
          tono={Number(datos.gastado) > 0 ? 'malo' : 'neutro'}
        />
        <Link href="/clientes" className="block">
          <Indicador
            titulo={p.porCobrar}
            valor={corta(Number(datos.por_cobrar))}
            detalle={p.teDebenAlumnos(datos.deben)}
            tono={Number(datos.por_cobrar) > 0 ? 'malo' : 'neutro'}
          />
        </Link>
        <Indicador
          titulo={p.alumnosActivos}
          valor={String(datos.alumnos_activos)}
          detalle={p.conPeriodoVigente}
        />
      </div>

      {/* ---------------- Lo que te queda ---------------- */}
      <div className="tarjeta p-4">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[14px] font-bold">{p.teQueda}</span>
          <span className={`font-titulo text-[22px] font-extrabold tabular-nums tracking-tight ${queda >= 0 ? 'text-verde-fuerte' : 'text-rojo'}`}>
            {plata(queda)}
          </span>
        </div>
        <p className="mt-1 text-[12.5px] text-tinta/45">{p.cobradoMenosGastado}</p>
      </div>

      {/* ---------------- En qué se fue la plata ---------------- */}
      {categorias.length > 0 && (
        <Seccion titulo={p.enQueSeFue} accion={<Link href="/gastos" className="boton-texto">{p.cargarGasto}</Link>}>
          <div className="space-y-3.5 px-4 pb-4 pt-3">
            {categorias.slice(0, 5).map((c) => (
              <div key={c.nombre}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="truncate text-[14px] font-semibold">{categoriaVisible(t, c.nombre)}</span>
                  <span className="shrink-0 text-[13.5px] font-bold tabular-nums">{dinero(c.monto, moneda, false, locale)}</span>
                </div>
                <Barra porcentaje={c.participacion} tono="rojo" />
              </div>
            ))}
          </div>
        </Seccion>
      )}
    </>
  );
}
