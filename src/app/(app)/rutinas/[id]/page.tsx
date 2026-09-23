import Link from 'next/link';
import { redirect } from 'next/navigation';
import { contextoObligatorio } from '@/lib/sesion';
import { tieneSeccion } from '@/lib/rubros';
import { clienteServidor } from '@/lib/supabase/servidor';
import { exigir } from '@/lib/lectura';
import { textos } from '@/i18n';
import { EditorRutina, type ClienteDelEditor } from '@/components/rutinas/EditorRutina';
import { UUID } from '@/components/rutinas/panel/utiles';
import type {
  CarpetaCliente, EjercicioBiblioteca, EstadoRutina, RutinaCompleta,
} from '@/lib/tipos-rutinas';

export const dynamic = 'force-dynamic';

type Busqueda = Record<string, string | string[] | undefined>;

/**
 * EL EDITOR DE UNA RUTINA (098).
 *
 *   /rutinas/<id>                 edita una que ya existe (plantilla, la
 *                                 próxima de alguien o la que ya ve);
 *     …?copiada=1&notas=0|1       recién copiada de una plantilla, de otro
 *                                 cliente o de una anterior (copiar_rutina
 *                                 con p_borrador, 099): nació como su
 *                                 próxima, y el editor lo dice arriba, con
 *                                 las notas de la original a revisar si
 *                                 vinieron;
 *   /rutinas/nueva?cliente=<id>   arma la de un cliente: su primera, o la
 *                                 próxima si ya tiene una vigente;
 *   /rutinas/nueva?plantilla=1    arma una plantilla.
 *
 * `?dia=<n>` abre en ese día (el editor lo usa al guardar una nueva, para
 * no volver al día A).
 *
 * La base decide en qué estado nace (`guardar_rutina`); esta página solo lo
 * adelanta para decir arriba quién la va a ver. Si el cliente ya tiene una
 * próxima en preparación no se arma otra al lado (la base la frenaría): se
 * abre esa.
 *
 * Una rutina que ya terminó no se edita: queda como historia.
 */
export default async function PaginaEditorRutina({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Busqueda>;
}) {
  const [{ id }, busqueda, ctx] = await Promise.all([params, searchParams, contextoObligatorio()]);
  if (!tieneSeccion(ctx.empresa.rubro, ctx.empresa.tipo_cuenta, '/rutinas')) redirect('/panel');

  const sb = clienteServidor();
  const empresa = ctx.empresa.id;
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

  /** La carpeta del cliente: su nombre, su teléfono (para mandarle el link) y «Salud y lesiones». */
  async function carpetaDe(clienteId: string): Promise<CarpetaCliente | null> {
    const r = await sb.rpc('rutinas_del_cliente', { p_empresa: empresa, p_cliente: clienteId });
    // «Ese cliente no es de esta cuenta.»: un link viejo o de otro negocio.
    if (r.error?.code === 'P0002') return null;
    return exigir(r, 'carpeta del cliente') as CarpetaCliente;
  }

  /** La biblioteca, para autocompletar. Si no llega, se sugiere solo la lista base. */
  const traerBiblioteca = async (): Promise<EjercicioBiblioteca[]> => {
    const { data, error } = await sb.rpc('ejercicios_de', { p_empresa: empresa });
    return !error && Array.isArray(data) ? (data as EjercicioBiblioteca[]) : [];
  };

  const aCliente = (c: CarpetaCliente['cliente'], carpeta: CarpetaCliente): ClienteDelEditor => ({
    id: c.id,
    nombre: c.nombre,
    telefono: c.telefono ?? '',
    notas: c.notas,
    enlace: carpeta.enlace,
  });

  let rutina: RutinaCompleta | null = null;
  let estado: EstadoRutina;
  let cliente: ClienteDelEditor | null = null;
  let actual: RutinaCompleta | null = null;
  let biblioteca: EjercicioBiblioteca[];
  const dia = parseInt(uno(busqueda.dia), 10);
  // Recién copiada (ver arriba). Sin «notas=1» explícito se toma como sin
  // notas: el aviso de revisarlas es lo que importa, y solo si vinieron.
  const copiada = uno(busqueda.copiada) === '1' ? { conNotas: uno(busqueda.notas) === '1' } : null;

  if (id === 'nueva') {
    const clienteId = uno(busqueda.cliente);
    if (clienteId) {
      if (!UUID.test(clienteId)) redirect('/rutinas');
      const [carpeta, lista] = await Promise.all([carpetaDe(clienteId), traerBiblioteca()]);
      if (!carpeta) redirect('/rutinas');
      // Ya tiene la próxima en preparación: se sigue con esa.
      if (carpeta.vigente && carpeta.borrador) redirect(`/rutinas/${carpeta.borrador.id}`);
      estado = carpeta.vigente ? 'borrador' : 'vigente';
      cliente = aCliente(carpeta.cliente, carpeta);
      actual = carpeta.vigente;
      biblioteca = lista;
    } else if (uno(busqueda.plantilla)) {
      estado = 'plantilla';
      biblioteca = await traerBiblioteca();
    } else {
      redirect('/rutinas');
    }
  } else {
    if (!UUID.test(id)) redirect('/rutinas');
    const [r, lista] = await Promise.all([
      sb.rpc('rutina', { p_empresa: empresa, p_rutina: id }),
      traerBiblioteca(),
    ]);
    // «Esa rutina no existe.»: borrada, o de otro negocio.
    if (r.error?.code === 'P0002') redirect('/rutinas');
    rutina = exigir(r, 'rutina') as RutinaCompleta;
    estado = rutina.estado;
    biblioteca = lista;
    if (rutina.cliente_id) {
      const carpeta = await carpetaDe(rutina.cliente_id);
      if (carpeta) cliente = aCliente(carpeta.cliente, carpeta);
    }
  }

  if (rutina?.estado === 'anterior') {
    const e = (await textos()).rutinasEditor.terminada;
    return (
      <div className="mx-auto w-full max-w-2xl">
        <div className="tarjeta p-5">
          <p className="text-[17px] font-bold">{e.titulo}</p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-tinta/65">{e.detalle}</p>
          <Link
            href={rutina.cliente_id ? `/rutinas/cliente/${rutina.cliente_id}` : '/rutinas'}
            className="boton-principal mt-4 min-h-[48px]"
          >
            {e.ir}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <EditorRutina
      // Otra rutina (o la nueva recién guardada) es otro editor, desde cero.
      key={rutina?.id ?? 'nueva'}
      empresaId={empresa}
      zona={ctx.zonaHoraria}
      rutina={rutina}
      estado={estado}
      cliente={cliente}
      actual={actual}
      biblioteca={biblioteca}
      copiada={rutina ? copiada : null}
      diaInicial={Number.isFinite(dia) && dia >= 0 ? dia : 0}
    />
  );
}
