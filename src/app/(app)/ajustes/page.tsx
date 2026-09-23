import { contextoObligatorio } from '@/lib/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';
import { EditorEmpresa, CodigoEquipo } from '@/components/PantallaAjustes';
import { VerEnOtraMoneda } from '@/components/VerEnOtraMoneda';
import type { Miembro } from '@/lib/tipos';
import { textos } from '@/i18n';
import { FICHA } from '@/i18n/idiomas';
import { SelectorIdioma, SelectorTema, AjustesDeAvisos } from '@/components/Preferencias';
import { SelectorZona } from '@/components/SelectorZona';
import { ListaEquipo, RotarCodigo } from '@/components/Equipo';
import { TarjetaPlan } from '@/components/TarjetaPlan';
import { ZonaPeligro } from '@/components/ZonaPeligro';
import { Soporte } from '@/components/Soporte';
import { esSuperadmin } from '@/lib/admin';
import { conJerga } from '@/i18n/jergas';
import { fichaDe, tieneSeccion } from '@/lib/rubros';
import Link from 'next/link';
import { MenuAjustes, CabeceraAjuste, SECCIONES_AJUSTES as SECCIONES, type SeccionAjustes as Clave } from '@/components/MenuAjustes';
import type { Preferencias } from '@/lib/tipos';

export const dynamic = 'force-dynamic';

/**
 * AJUSTES, POR SECCIONES.
 *
 * Antes era una sola pantalla larguísima con todos los formularios abiertos.
 * Matías: «cuando entrás te llena mucho visualmente, te cansa ver muchas
 * cosas de una». Ahora se entra a una lista —tu negocio, ver en otra moneda,
 * tu equipo, idioma…— y recién al tocar una aparece lo que hay adentro.
 *
 * La sección elegida va en la dirección (`?ver=equipo`) y no en un estado de
 * React: así el botón «atrás» del teléfono vuelve a la lista, y un aviso de
 * otra pantalla puede mandar directo a la sección que corresponde.
 */
export default async function PaginaAjustes({
  searchParams: busqueda,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await busqueda;
  const ctx = await contextoObligatorio();
  const supabase = clienteServidor();
  // Con la jerga del rubro, como plan/page.tsx: en agricultura la tabla de
  // permisos y los textos de costos dicen «Encargado» y no «Vendedor».
  const t = conJerga(await textos(), fichaDe(ctx.empresa.rubro, ctx.empresa.tipo_cuenta).jerga, ctx.idioma);
  const s = t.ajustes.secciones;

  /**
   * Una cuenta personal es de una sola persona.
   *
   * Ni el código para sumar gente ni la lista del equipo tienen sentido: no
   * hay equipo. Y no es solo cosmético — la base rechaza que alguien se una
   * a una cuenta personal aunque tenga el código, así que mostrarlo sería
   * ofrecer algo que va a fallar. Ver migración 019.
   */
  const esPersonal = ctx.empresa.tipo_cuenta === 'personal';
  // Solo para decidir si mostrar el acceso. El permiso real lo pone la base.
  const administraOrden = await esSuperadmin();

  const disponibles: Record<Clave, boolean> = {
    negocio: true,
    moneda: true,
    equipo: !esPersonal,
    plan: true,
    idioma: true,
    avisos: true,
    estado: true,
    permisos: !esPersonal,
    calculos: true,
    soporte: true,
    admin: administraOrden,
    peligro: true,
  };

  const pedida = typeof searchParams.ver === 'string' ? searchParams.ver : '';
  const ver = (SECCIONES as readonly string[]).includes(pedida) && disponibles[pedida as Clave]
    ? (pedida as Clave)
    : null;

  const titulos: Record<Clave, string> = {
    negocio: esPersonal ? t.pantallas.tuCuenta : t.pantallas.tuNegocio,
    moneda: t.ajustes.verEnOtraMoneda,
    equipo: s.equipo,
    plan: t.plan.titulo,
    idioma: s.idioma,
    avisos: t.ajustes.avisos,
    estado: t.pantallas.estadoSistema,
    permisos: t.pantallas.quienPuedeQue,
    calculos: t.pantallas.comoSeCalculan,
    soporte: t.soporte.titulo,
    admin: t.pantallas.administracionOrden,
    peligro: t.zonaPeligro.titulo,
  };

  // ---------------- La lista ----------------
  if (!ver) {
    const detalles: Record<Clave, string> = {
      negocio: s.negocio,
      moneda: s.moneda,
      equipo: s.equipoDetalle,
      plan: s.plan,
      idioma: s.idiomaDetalle,
      avisos: s.avisos,
      estado: s.estado,
      permisos: s.permisos,
      calculos: s.calculos,
      soporte: s.soporte,
      admin: s.admin,
      peligro: s.peligro,
    };
    // En grupos, como los ajustes del teléfono: la cuenta, cómo se ve y te
    // avisa, cómo funciona, y lo delicado aparte y al final.
    const grupos: Clave[][] = [
      ['negocio', 'moneda', 'equipo', 'plan'],
      ['idioma', 'avisos'],
      ['estado', 'permisos', 'calculos', 'soporte'],
      ['admin'],
      ['peligro'],
    ];

    return (
      <MenuAjustes
        grupos={grupos.map((g) => g.filter((c) => disponibles[c]))}
        titulos={titulos}
        detalles={detalles}
      />
    );
  }

  // ---------------- Una sección ----------------
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <CabeceraAjuste titulo={titulos[ver]} volver={t.nav.ajustes} />

      <div className="tarjeta overflow-hidden">
        {await contenido(ver)}
      </div>
    </div>
  );

  async function contenido(ver: Clave) {
    switch (ver) {
      case 'negocio':
        return (
          <div className="p-5">
            <EditorEmpresa empresa={ctx.empresa} puedeEditar={ctx.esAdmin} />
          </div>
        );

      // Va al lado de la moneda del negocio y no perdido en otra pantalla:
      // son la misma pregunta —«en qué moneda estoy mirando esto»—.
      case 'moneda':
        return (
          <div className="p-5">
            <VerEnOtraMoneda
              empresaId={ctx.empresa.id}
              monedaPropia={ctx.empresa.moneda}
              monedaVista={ctx.empresa.moneda_vista}
              cotizacion={ctx.empresa.cotizacion}
              cotizacionAt={ctx.empresa.cotizacion_at}
              puedeEditar={ctx.esAdmin}
            />
          </div>
        );

      case 'equipo': {
        const { data } = await supabase
          .from('miembros')
          .select('*')
          .eq('empresa_id', ctx.empresa.id)
          .order('created_at');
        const equipo = (data ?? []) as Miembro[];
        return (
          <>
            <div className="p-5">
              <p className="mb-3 text-[15px] font-bold">{t.pantallas.sumarGente}</p>
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
            <div className="border-t border-borde/70">
              <p className="px-5 pb-1 pt-4 text-[15px] font-bold">
                {t.equipo.titulo} · {t.ajustes.personas(equipo.length)}
              </p>
              <ListaEquipo
                miembros={equipo}
                empresaId={ctx.empresa.id}
                miUserId={ctx.userId}
                miRol={ctx.miembro.rol}
              />
            </div>
          </>
        );
      }

      case 'plan':
        return (
          <div className="p-5">
            <TarjetaPlan
              plan={ctx.planEfectivo}
              suscripcion={ctx.suscripcion}
              uso={ctx.capturasIA}
              moneda={ctx.empresa.moneda}
              locale={FICHA[ctx.idioma].locale}
              t={t}
            />
          </div>
        );

      case 'idioma':
        return (
          <div className="space-y-6 p-5">
            <SelectorIdioma />
            <SelectorTema />
            <SelectorZona empresaId={ctx.empresa.id} zona={ctx.zonaHoraria} puedeEditar={ctx.esAdmin} />
          </div>
        );

      case 'avisos': {
        // Si la lectura falla, se usan los valores por defecto: unas
        // preferencias que no se pudieron leer no justifican romper la sección.
        const { data: prefsCrudas } = await supabase.rpc('mis_preferencias');
        const prefs = (prefsCrudas ?? {
          idioma: ctx.idioma, aviso_cierre: true, aviso_semanal: true, hora_cierre: 20,
        }) as Preferencias;
        return (
          <div className="p-5">
            <AjustesDeAvisos
              inicial={prefs}
              esPersonal={esPersonal}
              // El aviso de los turnos de mañana solo existe donde hay agenda.
              tieneAgenda={tieneSeccion(ctx.empresa.rubro, ctx.empresa.tipo_cuenta, '/agenda')}
            />
          </div>
        );
      }

      case 'estado':
        return (
          <div className="space-y-3 p-5">
            <Estado
              activo={Boolean(process.env.OPENAI_API_KEY)}
              titulo={t.pantallas.estadoCaptura}
              detalleOk={t.pantallas.estadoCapturaOk}
              detalleMal={t.pantallas.estadoCapturaMal}
            />
            {/* Lo que se garantiza no es lo mismo según a quién se le habla.
                A un comercio le importa que un vendedor no vea sus costos; a
                alguien que lleva sus finanzas propias, que nadie más entre. */}
            {esPersonal ? (
              <>
                <Estado activo titulo={t.pantallas.estadoTuyos} detalleOk={t.pantallas.estadoTuyosOk} detalleMal="" />
                <Estado activo titulo={t.pantallas.estadoNumeros} detalleOk={t.pantallas.estadoNumerosOk} detalleMal="" />
                <Estado activo titulo={t.pantallas.estadoSaldo} detalleOk={t.pantallas.estadoSaldoOk} detalleMal="" />
              </>
            ) : (
              <>
                <Estado activo titulo={t.pantallas.estadoSeparados} detalleOk={t.pantallas.estadoSeparadosOk} detalleMal="" />
                <Estado activo titulo={t.pantallas.estadoVentas} detalleOk={t.pantallas.estadoVentasOk} detalleMal="" />
                <Estado activo titulo={t.pantallas.estadoCostos} detalleOk={t.pantallas.estadoCostosOk} detalleMal="" />
              </>
            )}
            <Estado activo titulo={t.pantallas.estadoApp} detalleOk={t.pantallas.estadoAppOk} detalleMal="" />
          </div>
        );

      case 'permisos':
        return (
          <>
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
          </>
        );

      case 'calculos':
        return esPersonal ? (
          <div className="space-y-2.5 p-5 text-[13.5px] leading-relaxed text-tinta/65">
            <p><strong className="text-tinta">{t.pantallas.entro}</strong> = {t.ajustes.calculoEntroPersonal}</p>
            <p><strong className="text-tinta">{t.pantallas.salio}</strong> = {t.ajustes.calculoSalioPersonal}</p>
            <p><strong className="text-tinta">{t.pantallas.teQuedo}</strong> = {t.ajustes.calculoQuedoPersonal}</p>
            <p><strong className="text-tinta">{t.nav.deudas}</strong> = {t.ajustes.calculoDeudasPersonal}</p>
            <p className="pt-1 text-[12.5px] text-tinta/45">{t.ajustes.anuladoNoSumaPersonal}</p>
          </div>
        ) : (
          <div className="space-y-2.5 p-5 text-[13.5px] leading-relaxed text-tinta/65">
            <p><strong className="text-tinta">{t.panel.vendido}</strong> = {t.ajustes.calculoVendido}</p>
            <p><strong className="text-tinta">{t.panel.gananciaBruta}</strong> = {t.ajustes.calculoBruta}</p>
            <p><strong className="text-tinta">{t.panel.gananciaNeta}</strong> = {t.ajustes.calculoNeta}</p>
            <p><strong className="text-tinta">{t.productos.colMargen}</strong> = {t.ajustes.calculoMargen}</p>
            <p className="pt-1 text-[12.5px] text-tinta/45">{t.ajustes.costoCongelado}</p>
            <p className="text-[12.5px] text-tinta/45">{t.ajustes.anuladaNoSumaNegocio}</p>
            <p className="text-[12.5px] text-tinta/45">{t.ajustes.descuentoRepartido}</p>
          </div>
        );

      case 'soporte':
        return <Soporte />;

      // Solo llega acá quien administra Orden: para los demás la sección ni
      // figura en la lista, y la dirección a mano vuelve a la lista.
      case 'admin':
        return (
          <div className="p-5">
            <Link href="/admin" className="boton-principal flex w-full py-3">
              {t.pantallas.abrirPanel}
            </Link>
            <p className="mt-2 text-[12.5px] leading-relaxed text-tinta/45">
              {t.pantallas.abrirPanelDetalle}
            </p>
          </div>
        );

      case 'peligro':
        return (
          <ZonaPeligro
            empresaId={ctx.empresa.id}
            nombreEmpresa={ctx.empresa.nombre}
            esPropietario={ctx.miembro.rol === 'propietario'}
          />
        );
    }
  }
}

function Estado({
  activo, titulo, detalleOk, detalleMal,
}: { activo: boolean; titulo: string; detalleOk: string; detalleMal: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-arena p-3.5">
      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
        activo ? 'bg-verde text-sobre-verde' : 'bg-ambar text-white'
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
