import { contextoObligatorio } from '@/lib/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';
import { Seccion } from '@/components/Piezas';
import { EditorEmpresa, CodigoEquipo } from '@/components/PantallaAjustes';
import type { Miembro } from '@/lib/tipos';
import { fechaLegible } from '@/lib/formato';
import { textos } from '@/i18n';
import { FICHA } from '@/i18n/idiomas';
import { SelectorIdioma, AjustesDeAvisos } from '@/components/Preferencias';
import { SelectorZona } from '@/components/SelectorZona';
import { ListaEquipo, RotarCodigo } from '@/components/Equipo';
import { TarjetaPlan } from '@/components/TarjetaPlan';
import { ZonaPeligro } from '@/components/ZonaPeligro';
import { Soporte } from '@/components/Soporte';
import { esSuperadmin } from '@/lib/admin';
import Link from 'next/link';
import type { Preferencias } from '@/lib/tipos';

export const dynamic = 'force-dynamic';

export default async function PaginaAjustes() {
  const ctx = await contextoObligatorio();
  const supabase = clienteServidor();

  const { data } = await supabase
    .from('miembros')
    .select('*')
    .eq('empresa_id', ctx.empresa.id)
    .order('created_at');

  const equipo = (data ?? []) as Miembro[];
  const hayIA = Boolean(process.env.OPENAI_API_KEY);
  // Solo para decidir si mostrar el acceso. El permiso real lo pone la base.
  const administraOrden = await esSuperadmin();
  /**
   * Una cuenta personal es de una sola persona.
   *
   * Ni el código para sumar gente ni la lista del equipo tienen sentido: no
   * hay equipo. Y no es solo cosmético — la base rechaza que alguien se una
   * a una cuenta personal aunque tenga el código, así que mostrarlo sería
   * ofrecer algo que va a fallar. Ver migración 019.
   */
  const esPersonal = ctx.empresa.tipo_cuenta === 'personal';
  const t = textos();
  const locale = FICHA[ctx.idioma].locale;

  // Si la lectura falla, se usan los valores por defecto: unas preferencias
  // que no se pudieron leer no justifican romper toda la pantalla de ajustes.
  const { data: prefsCrudas } = await supabase.rpc('mis_preferencias');
  const prefs = (prefsCrudas ?? {
    idioma: ctx.idioma, aviso_cierre: true, aviso_semanal: true, hora_cierre: 20,
  }) as Preferencias;

  const ROLES: Record<string, string> = {
    propietario: 'Propietario',
    admin: 'Administrador',
    vendedor: 'Vendedor',
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Seccion titulo={esPersonal ? t.pantallas.tuCuenta : t.pantallas.tuNegocio}>
          <div className="px-4 pb-4 pt-2">
            <EditorEmpresa empresa={ctx.empresa} puedeEditar={ctx.esAdmin} />
          </div>
        </Seccion>

        {!esPersonal && (
          <Seccion titulo={t.pantallas.sumarGente}>
            <div className="px-4 pb-4 pt-2">
              {ctx.esAdmin && ctx.codigoAcceso ? (
                <>
                  <CodigoEquipo codigo={ctx.codigoAcceso} />
                  <RotarCodigo
                    empresaId={ctx.empresa.id}
                    esPropietario={ctx.miembro.rol === 'propietario'}
                  />
                </>
              ) : (
                <p className="text-[13.5px] leading-relaxed text-tinta/55">
                  Solo los administradores pueden ver el código para sumar colaboradores.
                </p>
              )}
            </div>
          </Seccion>
        )}
      </div>

      {!esPersonal && (
        <Seccion titulo={`${t.equipo.titulo} · ${equipo.length} persona${equipo.length === 1 ? '' : 's'}`}>
          <ListaEquipo
            miembros={equipo}
            empresaId={ctx.empresa.id}
            miUserId={ctx.userId}
            miRol={ctx.miembro.rol}
          />
        </Seccion>
      )}

      <Seccion titulo={t.pantallas.estadoSistema}>
        <div className="space-y-3 px-4 pb-4 pt-3">
          <Estado
            activo={hayIA}
            titulo={t.pantallas.estadoCaptura}
            detalleOk={t.pantallas.estadoCapturaOk}
            detalleMal={t.pantallas.estadoCapturaMal}
          />
          {/* Lo que se garantiza no es lo mismo según a quién se le habla.
              A un comercio le importa que un vendedor no vea sus costos; a
              alguien que lleva sus finanzas propias, que nadie más entre. */}
          {esPersonal ? (
            <>
              <Estado
                activo
                titulo={t.pantallas.estadoTuyos}
                detalleOk={t.pantallas.estadoTuyosOk}
                detalleMal=""
              />
              <Estado
                activo
                titulo={t.pantallas.estadoNumeros}
                detalleOk={t.pantallas.estadoNumerosOk}
                detalleMal=""
              />
              <Estado
                activo
                titulo={t.pantallas.estadoSaldo}
                detalleOk={t.pantallas.estadoSaldoOk}
                detalleMal=""
              />
            </>
          ) : (
            <>
              <Estado
                activo
                titulo={t.pantallas.estadoSeparados}
                detalleOk={t.pantallas.estadoSeparadosOk}
                detalleMal=""
              />
              <Estado
                activo
                titulo={t.pantallas.estadoVentas}
                detalleOk={t.pantallas.estadoVentasOk}
                detalleMal=""
              />
              <Estado
                activo
                titulo={t.pantallas.estadoCostos}
                detalleOk={t.pantallas.estadoCostosOk}
                detalleMal=""
              />
            </>
          )}
          <Estado
            activo
            titulo={t.pantallas.estadoApp}
            detalleOk={t.pantallas.estadoAppOk}
            detalleMal=""
          />
        </div>
      </Seccion>

      <div className="grid gap-5 lg:grid-cols-2">
        <Seccion titulo={t.ajustes.idioma}>
          <div className="space-y-5 px-4 pb-5 pt-3">
            <SelectorIdioma />
            <SelectorZona empresaId={ctx.empresa.id} zona={ctx.zonaHoraria} puedeEditar={ctx.esAdmin} />
          </div>
        </Seccion>

        <Seccion titulo={t.ajustes.avisos}>
          <div className="px-4 pb-5 pt-3">
            <AjustesDeAvisos inicial={prefs} />
          </div>
        </Seccion>
      </div>

      <Seccion titulo={t.plan.titulo}>
        <div className="px-4 pb-4 pt-3">
          <TarjetaPlan
            plan={ctx.planEfectivo}
            suscripcion={ctx.suscripcion}
            uso={ctx.capturasIA}
            moneda={ctx.empresa.moneda}
            locale={locale}
            t={t}
          />
        </div>
      </Seccion>

      {!esPersonal && (
      <Seccion titulo={t.pantallas.quienPuedeQue}>
        <div className="overflow-x-auto">
          <table className="tabla min-w-[520px]">
            <thead>
              <tr>
                <th>{t.pantallas.colAccion}</th>
                <th className="text-center">{t.pantallas.colPropietario}</th>
                <th className="text-center">{t.pantallas.colAdmin}</th>
                <th className="text-center">{t.pantallas.colVendedor}</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Registrar ventas', true, true, true],
                ['Registrar gastos e ingresos', true, true, true],
                ['Anular lo propio del día', true, true, true],
                ['Anular lo de otros o de días anteriores', true, true, false],
                ['Ver precio y stock', true, true, true],
                ['Ver el costo de compra', true, true, false],
                ['Ver márgenes y ganancias', true, true, false],
                ['Crear y editar productos', true, true, false],
                ['Definir la meta del reto', true, true, false],
                ['Ver el resumen operativo', true, true, true],
                ['Ver reportes financieros y Excel', true, true, false],
                ['Ver el código para sumar gente', true, true, false],
                ['Cambiar datos del negocio y equipo', true, true, false],
                ['Cambiar el plan de suscripción', false, false, false],
              ].map(([accion, prop, adm, ven]) => (
                <tr key={accion as string}>
                  <td className="font-semibold">{accion}</td>
                  {[prop, adm, ven].map((v, i) => (
                    <td key={i} className="text-center">
                      <span className={v ? 'font-bold text-verde-fuerte' : 'text-tinta/25'}>{v ? '✓' : '—'}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 pb-4 pt-3 text-[12.5px] leading-relaxed text-tinta/45">
          Estos permisos están aplicados en la base de datos, no en los botones. Los costos
          de compra ni siquiera salen del servidor para un vendedor: le llegan vacíos. Aunque
          alguien abra la consola del navegador y consulte directamente, no puede recuperarlos.
          El plan de suscripción no lo cambia nadie desde la aplicación: lo define el sistema
          de pagos.
        </p>
      </Seccion>
      )}

      <Seccion titulo={t.pantallas.comoSeCalculan}>
        {esPersonal && (
          <div className="space-y-2.5 px-4 pt-3 text-[13.5px] leading-relaxed text-tinta/65">
            <p><strong className="text-tinta">{t.pantallas.entro}</strong> = tu sueldo y cualquier otro ingreso del período.</p>
            <p><strong className="text-tinta">{t.pantallas.salio}</strong> = todos tus gastos.</p>
            <p><strong className="text-tinta">{t.pantallas.teQuedo}</strong> = lo que entró menos lo que salió.</p>
            <p><strong className="text-tinta">{t.nav.deudas}</strong> = lo que falta pagar. El saldo solo baja registrando pagos.</p>
          </div>
        )}
        {!esPersonal && (
        <div className="space-y-2.5 px-4 pb-5 pt-3 text-[13.5px] leading-relaxed text-tinta/65">
          <p><strong className="text-tinta">{t.panel.vendido}</strong> = lo que realmente cobraste, ya con los descuentos restados.</p>
          <p><strong className="text-tinta">{t.panel.gananciaBruta}</strong> = ventas − lo que te costó esa mercadería.</p>
          <p><strong className="text-tinta">{t.panel.gananciaNeta}</strong> = ganancia bruta + otros ingresos − todos los gastos del periodo.</p>
          <p><strong className="text-tinta">{t.productos.colMargen}</strong> = qué porcentaje de cada venta te queda como ganancia.</p>
          <p className="pt-1 text-[12.5px] leading-relaxed text-tinta/45">
            El costo de cada producto se congela en el momento de la venta. Si después cambiás el costo o el
            precio, tus reportes viejos siguen mostrando los números reales de ese día.
          </p>
          <p className="text-[12.5px] leading-relaxed text-tinta/45">
            Una operación anulada queda en el historial pero no suma en ningún total, ranking, reto ni hoja de
            Excel. Si era una venta, el stock vuelve automáticamente.
          </p>
          <p className="text-[12.5px] leading-relaxed text-tinta/45">
            Cuando hacés un descuento sobre varios productos, se reparte entre ellos en proporción a lo que
            pesa cada uno. Por eso la suma del ranking de productos da exactamente lo mismo que el panel.
          </p>
        </div>
        )}
        {esPersonal && (
        <div className="space-y-2.5 px-4 pb-5 text-[12.5px] leading-relaxed text-tinta/45">
          <p>
            Un movimiento anulado queda en el historial pero no suma en ningún total ni en el Excel.
          </p>
        </div>
        )}
      </Seccion>

      <Seccion titulo={t.soporte.titulo}>
        <Soporte />
      </Seccion>

      {/* Solo lo ve quien administra Orden. Para todos los demás este
          bloque no existe: ni el enlace, ni la mención de que hay un panel. */}
      {administraOrden && (
        <Seccion titulo={t.pantallas.administracionOrden}>
          <Link
            href="/admin"
            className="boton-suave flex w-full items-center justify-center gap-2 py-2.5"
          >
            {t.pantallas.abrirPanel}
          </Link>
          <p className="mt-2 text-[12.5px] leading-relaxed text-tinta/45">
            {t.pantallas.abrirPanelDetalle}
          </p>
        </Seccion>
      )}

      {/* Última de todo a propósito: nadie llega acá haciendo scroll para
          otra cosa, y adentro tampoco se muestra nada hasta que se abre. */}
      <Seccion titulo={t.zonaPeligro.titulo}>
        <ZonaPeligro
          empresaId={ctx.empresa.id}
          nombreEmpresa={ctx.empresa.nombre}
          esPropietario={ctx.miembro.rol === 'propietario'}
        />
      </Seccion>
    </div>
  );
}

function Estado({
  activo, titulo, detalleOk, detalleMal,
}: { activo: boolean; titulo: string; detalleOk: string; detalleMal: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-borde p-3.5">
      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white ${
        activo ? 'bg-verde' : 'bg-ambar'
      }`}>
        {activo ? '✓' : '!'}
      </span>
      <div>
        <p className="text-[14px] font-semibold">{titulo}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-tinta/55">{activo ? detalleOk : detalleMal}</p>
      </div>
    </div>
  );
}
