import { contextoObligatorio } from '@/lib/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';
import { Seccion } from '@/components/Piezas';
import { EditorEmpresa, CodigoEquipo } from '@/components/PantallaAjustes';
import { VerEnOtraMoneda } from '@/components/VerEnOtraMoneda';
import type { Miembro } from '@/lib/tipos';
import { fechaLegible } from '@/lib/formato';
import { textos } from '@/i18n';
import { FICHA } from '@/i18n/idiomas';
import { SelectorIdioma, SelectorTema, AjustesDeAvisos } from '@/components/Preferencias';
import { SelectorZona } from '@/components/SelectorZona';
import { ListaEquipo, RotarCodigo } from '@/components/Equipo';
import { TarjetaPlan } from '@/components/TarjetaPlan';
import { ZonaPeligro } from '@/components/ZonaPeligro';
import { Soporte } from '@/components/Soporte';
import { esSuperadmin } from '@/lib/admin';
import { tieneSeccion } from '@/lib/rubros';
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
  // El aviso de los turnos de mañana solo existe donde hay agenda.
  const tieneAgenda = tieneSeccion(ctx.empresa.rubro, ctx.empresa.tipo_cuenta, '/agenda');
  const t = textos();
  const locale = FICHA[ctx.idioma].locale;

  // Si la lectura falla, se usan los valores por defecto: unas preferencias
  // que no se pudieron leer no justifican romper toda la pantalla de ajustes.
  const { data: prefsCrudas } = await supabase.rpc('mis_preferencias');
  const prefs = (prefsCrudas ?? {
    idioma: ctx.idioma, aviso_cierre: true, aviso_semanal: true, hora_cierre: 20,
  }) as Preferencias;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Seccion titulo={esPersonal ? t.pantallas.tuCuenta : t.pantallas.tuNegocio}>
          <div className="px-4 pb-4 pt-2">
            <EditorEmpresa empresa={ctx.empresa} puedeEditar={ctx.esAdmin} />
          </div>
        </Seccion>

        {/* Va pegado a la moneda del negocio y no perdido en otra pantalla:
            son la misma pregunta —«en qué moneda estoy mirando esto»— y
            separarlas haría que alguien cambie la de arriba buscando esto. */}
        <Seccion titulo={t.ajustes.verEnOtraMoneda}>
          <div className="px-4 pb-4 pt-3">
            <VerEnOtraMoneda
              empresaId={ctx.empresa.id}
              monedaPropia={ctx.empresa.moneda}
              monedaVista={ctx.empresa.moneda_vista}
              cotizacion={ctx.empresa.cotizacion}
              cotizacionAt={ctx.empresa.cotizacion_at}
              puedeEditar={ctx.esAdmin}
            />
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
                  {t.ajustes.soloAdminCodigo}
                </p>
              )}
            </div>
          </Seccion>
        )}
      </div>

      {!esPersonal && (
        <Seccion titulo={`${t.equipo.titulo} · ${t.ajustes.personas(equipo.length)}`}>
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
            <SelectorTema />
            <SelectorZona empresaId={ctx.empresa.id} zona={ctx.zonaHoraria} puedeEditar={ctx.esAdmin} />
          </div>
        </Seccion>

        <Seccion titulo={t.ajustes.avisos}>
          <div className="px-4 pb-5 pt-3">
            <AjustesDeAvisos
              inicial={prefs}
              esPersonal={esPersonal}
              tieneAgenda={tieneAgenda}
            />
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
              {/* Quién puede qué, por fila. El texto de cada fila sale del
                  diccionario por posición (`t.ajustes.permisos[i]`). */}
              {([
                [true, true, true],
                [true, true, true],
                [true, true, true],
                [true, true, false],
                [true, true, true],
                [true, true, false],
                [true, true, false],
                [true, true, false],
                [true, true, false],
                [true, true, true],
                [true, true, false],
                [true, true, false],
                [true, true, false],
                [false, false, false],
              ] as const).map(([prop, adm, ven], fila) => [t.ajustes.permisos[fila], prop, adm, ven] as const).map(([accion, prop, adm, ven]) => (
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
          {t.ajustes.permisosEnLaBase}
        </p>
      </Seccion>
      )}

      <Seccion titulo={t.pantallas.comoSeCalculan}>
        {esPersonal && (
          <div className="space-y-2.5 px-4 pt-3 text-[13.5px] leading-relaxed text-tinta/65">
            <p><strong className="text-tinta">{t.pantallas.entro}</strong> = {t.ajustes.calculoEntroPersonal}</p>
            <p><strong className="text-tinta">{t.pantallas.salio}</strong> = {t.ajustes.calculoSalioPersonal}</p>
            <p><strong className="text-tinta">{t.pantallas.teQuedo}</strong> = {t.ajustes.calculoQuedoPersonal}</p>
            <p><strong className="text-tinta">{t.nav.deudas}</strong> = {t.ajustes.calculoDeudasPersonal}</p>
          </div>
        )}
        {!esPersonal && (
        <div className="space-y-2.5 px-4 pb-5 pt-3 text-[13.5px] leading-relaxed text-tinta/65">
          <p><strong className="text-tinta">{t.panel.vendido}</strong> = {t.ajustes.calculoVendido}</p>
          <p><strong className="text-tinta">{t.panel.gananciaBruta}</strong> = {t.ajustes.calculoBruta}</p>
          <p><strong className="text-tinta">{t.panel.gananciaNeta}</strong> = {t.ajustes.calculoNeta}</p>
          <p><strong className="text-tinta">{t.productos.colMargen}</strong> = {t.ajustes.calculoMargen}</p>
          <p className="pt-1 text-[12.5px] leading-relaxed text-tinta/45">
            {t.ajustes.costoCongelado}
          </p>
          <p className="text-[12.5px] leading-relaxed text-tinta/45">
            {t.ajustes.anuladaNoSumaNegocio}
          </p>
          <p className="text-[12.5px] leading-relaxed text-tinta/45">
            {t.ajustes.descuentoRepartido}
          </p>
        </div>
        )}
        {esPersonal && (
        <div className="space-y-2.5 px-4 pb-5 text-[12.5px] leading-relaxed text-tinta/45">
          <p>
            {t.ajustes.anuladoNoSumaPersonal}
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
