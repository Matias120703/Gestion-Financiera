import { redirect } from 'next/navigation';
import { contextoObligatorio } from '@/lib/sesion';
import { fichaDe } from '@/lib/rubros';
import { clienteServidor } from '@/lib/supabase/servidor';
import { traerResumen, traerRanking, traerSerieDiaria } from '@/lib/agregados';
import { diasDelRango, diffDias, hoyISO } from '@/lib/fechas';
import { dinero, dineroCorto, porcentaje, numero, fechaLegible, dineroQuizas, porcentajeQuizas } from '@/lib/formato';
import { Barra, Indicador, Vacio, Seccion, GraficoDiario } from '@/components/Piezas';
import { EditorReto } from '@/components/EditorReto';
import { permisosDe } from '@/lib/permisos';
import type { Reto } from '@/lib/tipos';

export const dynamic = 'force-dynamic';

/**
 * Solo comercio.
 *
 * Una cuenta personal no vende ni lleva productos, así que esta pantalla no
 * existe para ella. Redirige en vez de mostrar un cartel de «no disponible»:
 * si nunca se ofreció el camino, llegar acá es una URL escrita a mano o un
 * enlace viejo, y lo útil es dejar a la persona donde sí hay algo.
 */
export default async function PaginaReto() {
  const ctx = await contextoObligatorio();
  // Este rubro no tiene esta pantalla. Ver src/lib/rubros.ts.
  if (fichaDe(ctx.empresa.rubro).sinSecciones.includes('/reto')) redirect('/panel');

  if (ctx.empresa.tipo_cuenta === 'personal') redirect('/panel');

  const supabase = clienteServidor();
  const m = ctx.empresa.moneda;

  const { data } = await supabase
    .from('retos')
    .select('*')
    .eq('empresa_id', ctx.empresa.id)
    .order('activo', { ascending: false })
    .order('fecha_inicio', { ascending: false })
    .limit(20);

  const retos = (data ?? []) as Reto[];
  const activo = retos.find((r) => r.activo) ?? null;

  if (!activo) {
    return (
      <div className="space-y-5">
        <div className="tarjeta">
          <Vacio
            titulo="Todavía no tenés un reto"
            detalle="Poné una meta con fecha límite y el sistema calcula solo cuánto te falta y a qué ritmo tenés que ir."
          />
          <div className="px-6 pb-6">
            <EditorReto empresaId={ctx.empresa.id} moneda={m} puedeGestionar={ctx.esAdmin} />
          </div>
        </div>
        {retos.length > 0 && <HistorialRetos retos={retos} moneda={m} />}
      </div>
    );
  }

  // El progreso sale de un solo objeto agregado: no se descarga el historial.
  const r = await traerResumen(ctx.empresa.id, activo.fecha_inicio, activo.fecha_fin);
  const verRent = permisosDe(ctx.miembro.rol).verRentabilidad && r.conCostos;
  const meta = Number(activo.meta);

  // Un reto medido por ganancia necesita los costos. Si quien mira no puede
  // verlos, no inventamos un número: se lo decimos.
  const logradoQuizas = activo.medida === 'ganancia'
    ? (r.conCostos ? r.gananciaNeta : null)
    : r.ventas;
  if (logradoQuizas === null) {
    return (
      <div className="space-y-5">
        <div className="tarjeta overflow-hidden">
          <div className="bg-tinta px-5 py-6 text-white">
            <p className="text-[11px] font-bold uppercase tracking-[.14em] text-white/45">Reto en curso</p>
            <h2 className="mt-1.5 text-[22px] font-bold tracking-tight">{activo.nombre}</h2>
            <p className="mt-1 text-[13.5px] text-white/50">
              {fechaLegible(activo.fecha_inicio)} — {fechaLegible(activo.fecha_fin)}
            </p>
          </div>
          <div className="px-5 py-6">
            <p className="text-[14px] leading-relaxed text-tinta/65">
              Esta meta se mide por <strong>ganancia neta</strong>, que se calcula con los costos del
              negocio. Esa información la ve el propietario y los administradores.
            </p>
            <p className="mt-3 text-[13.5px] text-tinta/55">
              Lo que sí podés ver: en este periodo se vendieron{' '}
              <strong className="text-tinta">{dinero(r.ventas, m)}</strong> en {numero(r.cantidadVentas)} operaciones.
            </p>
          </div>
        </div>
      </div>
    );
  }
  const logrado = logradoQuizas;
  const falta = Math.max(0, meta - logrado);
  const avance = meta > 0 ? (logrado / meta) * 100 : 0;

  const hoy = hoyISO();
  const totalDias = diffDias(activo.fecha_inicio, activo.fecha_fin) + 1;
  const yaEmpezó = hoy >= activo.fecha_inicio;
  const terminó = hoy > activo.fecha_fin;
  const diasTranscurridos = terminó ? totalDias : yaEmpezó ? diffDias(activo.fecha_inicio, hoy) + 1 : 0;
  const diasRestantes = Math.max(0, totalDias - diasTranscurridos);

  const ritmoNecesario = diasRestantes > 0 ? falta / diasRestantes : falta;
  const ritmoActual = diasTranscurridos > 0 ? logrado / diasTranscurridos : 0;
  const deberiaLlevar = totalDias > 0 ? (meta / totalDias) * diasTranscurridos : 0;
  const diferencia = logrado - deberiaLlevar;
  const proyeccion = ritmoActual * totalDias;

  const dias = diasDelRango(activo.fecha_inicio, activo.fecha_fin, 200);
  const [serie, top] = await Promise.all([
    traerSerieDiaria(ctx.empresa.id, dias[0] ?? activo.fecha_inicio, dias[dias.length - 1] ?? activo.fecha_fin),
    traerRanking(ctx.empresa.id, activo.fecha_inicio, activo.fecha_fin, 5),
  ]);
  const mejorDia = [...serie].sort((a, b) => b.ventas - a.ventas)[0];

  const etiquetaMedida = activo.medida === 'ganancia' ? 'ganancia neta' : 'ventas';

  return (
    <div className="space-y-5">
      {/* ------------------------- cabecera del reto ------------------------- */}
      <div className="tarjeta overflow-hidden">
        <div className="bg-tinta px-5 py-6 text-white">
          <p className="text-[11px] font-bold uppercase tracking-[.14em] text-white/45">
            {terminó ? 'Reto terminado' : yaEmpezó ? 'Reto en curso' : 'Reto por empezar'}
          </p>
          <h2 className="mt-1.5 text-[22px] font-bold tracking-tight lg:text-[26px]">{activo.nombre}</h2>
          <p className="mt-1 text-[13.5px] text-white/50">
            {fechaLegible(activo.fecha_inicio)} — {fechaLegible(activo.fecha_fin)} · meta de {etiquetaMedida}
          </p>

          <div className="mt-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-[34px] font-bold leading-none tracking-tight tabular-nums lg:text-[42px]">
                {dineroCorto(logrado, m)}
              </p>
              <p className="mt-1.5 text-[13.5px] text-white/50">de {dinero(meta, m)}</p>
            </div>
            <p className="text-[30px] font-bold leading-none tabular-nums text-verde lg:text-[36px]">
              {porcentaje(Math.min(avance, 999), 0)}
            </p>
          </div>

          <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-white/12">
            <div
              className="h-full rounded-full bg-verde transition-all"
              style={{ width: `${Math.min(100, Math.max(0, avance))}%` }}
            />
          </div>

          {!terminó && (
            <p className="mt-3 text-[13.5px] font-semibold">
              {falta === 0 ? (
                <span className="text-verde">¡Meta alcanzada! Todo lo que sigue es de más.</span>
              ) : diasRestantes > 0 ? (
                <>Te faltan <span className="text-verde">{dinero(falta, m)}</span> en {diasRestantes} día{diasRestantes === 1 ? '' : 's'}.</>
              ) : (
                <>Último día. Te faltan {dinero(falta, m)}.</>
              )}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 divide-x divide-borde border-t border-borde lg:grid-cols-4">
          <Celda titulo="Por día para llegar" valor={dineroCorto(ritmoNecesario, m)} detalle={diasRestantes > 0 ? `${diasRestantes} días restantes` : 'sin días restantes'} />
          <Celda titulo="Ritmo actual" valor={dineroCorto(ritmoActual, m)} detalle="promedio por día" />
          <Celda
            titulo="Vas" valor={diferencia >= 0 ? 'adelantado' : 'atrasado'}
            detalle={`${diferencia >= 0 ? '+' : '−'} ${dineroCorto(Math.abs(diferencia), m)} vs. lo previsto`}
            tono={diferencia >= 0 ? 'bueno' : 'malo'}
          />
          <Celda
            titulo="Si seguís así" valor={dineroCorto(proyeccion, m)}
            detalle={proyeccion >= meta ? 'llegás a la meta' : `te quedás a ${dineroCorto(meta - proyeccion, m)}`}
            tono={proyeccion >= meta ? 'bueno' : 'malo'}
          />
        </div>
      </div>

      {/* ------------------------- números del reto ------------------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador titulo="Vendido" valor={dineroCorto(r.ventas, m)} detalle={`${numero(r.cantidadVentas)} ventas`} />
        {verRent ? (
          <Indicador titulo="Ganancia neta" valor={dineroCorto(r.gananciaNeta, m)} tono={r.gananciaNeta >= 0 ? 'bueno' : 'malo'} />
        ) : (
          <Indicador titulo="Unidades" valor={numero(r.unidadesVendidas)} detalle="entregadas" />
        )}
        <Indicador titulo="Gastos" valor={dineroCorto(r.gastos, m)} tono="malo" />
        <Indicador
          titulo="Mejor día"
          valor={mejorDia && mejorDia.ventas > 0 ? dineroCorto(mejorDia.ventas, m) : '—'}
          detalle={mejorDia && mejorDia.ventas > 0 ? fechaLegible(mejorDia.fecha, false) : 'sin ventas todavía'}
        />
      </div>

      {r.ventasAnuladas > 0 && (
        <p className="rounded-xl bg-arena px-4 py-3 text-[13px] text-tinta/60">
          {r.ventasAnuladas} operación{r.ventasAnuladas === 1 ? '' : 'es'} anulada{r.ventasAnuladas === 1 ? '' : 's'} en
          el reto. No cuentan para la meta.
        </p>
      )}

      {(r.cantidadVentas > 0 || r.gastos > 0) && (
        <div className="tarjeta p-4">
          <h2 className="mb-4 text-[15px] font-bold tracking-tight">Cómo viene cada día</h2>
          <GraficoDiario datos={serie} moneda={m} />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Seccion titulo="Lo que más está tirando">
          {top.length === 0 ? (
            <Vacio titulo="Sin ventas todavía" detalle="Registrá tu primera venta del reto y acá vas a ver qué producto rinde más." />
          ) : (
            <ul className="divide-y divide-borde">
              {top.map((p, i) => (
                <li key={p.producto_id ?? p.nombre} className="flex items-center gap-3 px-4 py-3">
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[12px] font-bold ${
                    i === 0 ? 'bg-verde text-white' : 'bg-arena text-tinta/50'
                  }`}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold">{p.nombre}</p>
                    <p className="text-[12px] text-tinta/45">
                      {numero(p.unidades)} unidades{verRent && ` · margen ${porcentajeQuizas(p.margen, 0)}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[14px] font-bold tabular-nums">{dinero(p.ingresos, m, false)}</p>
                    {verRent && p.ganancia !== null && (
                      <p className="text-[11.5px] font-semibold tabular-nums text-verde-fuerte">+{dineroQuizas(p.ganancia, m, false)}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Seccion>

        <div className="tarjeta p-4">
          <h2 className="text-[15px] font-bold tracking-tight">Ajustar el reto</h2>
          <p className="mt-1 text-[13.5px] leading-relaxed text-tinta/55">
            Cambiá la meta o las fechas, o cerralo y empezá uno nuevo.
          </p>
          <div className="mt-4">
            <EditorReto empresaId={ctx.empresa.id} moneda={m} reto={activo} puedeGestionar={ctx.esAdmin} />
          </div>
        </div>
      </div>

      {retos.length > 1 && <HistorialRetos retos={retos.filter((x) => x.id !== activo.id)} moneda={m} />}
    </div>
  );
}

function Celda({
  titulo, valor, detalle, tono = 'neutro',
}: { titulo: string; valor: string; detalle: string; tono?: 'neutro' | 'bueno' | 'malo' }) {
  const color = tono === 'bueno' ? 'text-verde-fuerte' : tono === 'malo' ? 'text-rojo' : 'text-tinta';
  return (
    <div className="px-4 py-3.5">
      <p className="titulo-seccion">{titulo}</p>
      <p className={`mt-1.5 text-[17px] font-bold tabular-nums tracking-tight ${color}`}>{valor}</p>
      <p className="mt-0.5 text-[11.5px] text-tinta/45">{detalle}</p>
    </div>
  );
}

function HistorialRetos({ retos, moneda }: { retos: Reto[]; moneda: string }) {
  if (retos.length === 0) return null;
  return (
    <Seccion titulo="Retos anteriores">
      <ul className="divide-y divide-borde">
        {retos.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold">{r.nombre}</p>
              <p className="text-[12px] text-tinta/45">
                {fechaLegible(r.fecha_inicio, false)} — {fechaLegible(r.fecha_fin)}
              </p>
            </div>
            <span className="shrink-0 text-[13.5px] font-bold tabular-nums">{dinero(Number(r.meta), moneda, false)}</span>
          </li>
        ))}
      </ul>
    </Seccion>
  );
}
