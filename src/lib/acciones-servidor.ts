import { traerProfesionales, soloServicios } from '@/lib/reparto';
import { traerServiciosAgenda } from '@/lib/agenda';
import { fichaDe, tieneSeccion } from '@/lib/rubros';
import {
  bloqueTurnos, sanearTurno, mismoNombre,
  type ServicioDictable, type ProfesionalDictable, type TurnoRespuesta,
} from '@/lib/turno-voz';
import type { Producto, TipoCaptura, TipoCuenta } from '@/lib/tipos';

/**
 * La parte de las acciones de voz que necesita la base: qué existe en esta
 * cuenta y a quién se refiere un turno. Lo que se puede probar sin servidor
 * está en acciones.ts y turno-voz.ts.
 */

export interface ContextoAcciones {
  hoy: string;
  servicios: ServicioDictable[];
  profesionales: ProfesionalDictable[];
  /** Los tipos que no son plata y existen en ESTA cuenta. */
  tipos: TipoCaptura[];
  /** Lo que se agrega a las instrucciones sobre turnos. '' si no hay agenda. */
  bloqueTurnos: string;
}

/**
 * Qué acciones tiene sentido ofrecerle al modelo.
 *
 * Solo las que existen en la cuenta: a una perfumería sin agenda no se le
 * ofrecen turnos, y a una cuenta personal ni catálogo ni clientes. Un tipo
 * disponible es un tipo que el modelo va a usar; uno que no corresponde
 * termina eligiéndose mal con toda seguridad.
 *
 * Si leer la agenda falla, la captura sigue: solo se pierde entender turnos.
 */
export async function contextoAcciones(d: {
  empresaId: string;
  rubro: string | null;
  tipoCuenta: TipoCuenta;
  hoy: string;
  catalogo: Producto[];
}): Promise<ContextoAcciones> {
  const esPersonal = d.tipoCuenta === 'personal';
  const hay = (s: '/agenda' | '/productos' | '/clientes') =>
    !esPersonal && tieneSeccion(d.rubro, d.tipoCuenta, s);

  let servicios: ServicioDictable[] = [];
  let profesionales: ProfesionalDictable[] = [];
  if (hay('/agenda')) {
    try {
      const [equipo, agenda] = await Promise.all([
        traerProfesionales(d.empresaId),
        traerServiciosAgenda(d.empresaId),
      ]);
      // Los mismos que ofrece el formulario de la agenda: servicios marcados
      // para reservarse, y gente activa.
      const reservables = new Map(
        agenda.filter((s) => s.reservable).map((s) => [s.producto_id, Number(s.duracion_min)]));
      servicios = soloServicios(d.catalogo)
        .filter((p) => reservables.has(p.id))
        .map((p) => ({ id: p.id, nombre: p.nombre, duracion_min: reservables.get(p.id) ?? 0 }));
      profesionales = equipo.filter((p) => p.activo).map((p) => ({ id: p.id, nombre: p.nombre }));
    } catch (e: any) {
      console.error('[capturar] agenda', e?.message);
    }
  }

  // Un profe no tiene servicios reservables ni equipo, pero sí agenda: lo
  // dictado («clases con Juan los martes a las seis») llega a inscribir
  // al alumno (092). Sin esto, el micrófono le decía que su negocio no
  // tenía agenda.
  const deAlumnos = !esPersonal && fichaDe(d.rubro, d.tipoCuenta).agendaDeAlumnos;
  if (deAlumnos && servicios.length === 0) servicios = [{ id: 'clase', nombre: 'Clase', duracion_min: 60 }];
  const conTurnos = deAlumnos || (servicios.length > 0 && profesionales.length > 0);
  const tipos: TipoCaptura[] = [];
  if (conTurnos) tipos.push('turno');
  if (hay('/productos')) tipos.push('producto');
  if (hay('/clientes')) tipos.push('cliente');

  return {
    hoy: d.hoy,
    servicios,
    profesionales,
    tipos,
    bloqueTurnos: conTurnos ? bloqueTurnos({ hoy: d.hoy, servicios, profesionales }) : '',
  };
}

/**
 * Un turno dictado, saneado y con su cliente si se lo reconoce sin dudas: el
 * mismo teléfono, o el mismo nombre y uno solo con ese nombre. Con dos
 * «Juan» no se elige ninguno: la persona lo ve en el formulario y elige.
 */
export async function turnoDictado(d: {
  datos: any;
  ctx: ContextoAcciones;
  transcripcion: string | null;
  buscarClientes: (texto: string) => Promise<{ id: string; nombre: string; telefono: string }[]>;
}): Promise<TurnoRespuesta> {
  const t = d.datos?.turno && typeof d.datos.turno === 'object' ? d.datos.turno : {};
  const turno = sanearTurno({
    cliente_nombre: d.datos?.contraparte,
    cliente_telefono: t.telefono,
    fecha: t.fecha,
    hora: t.hora,
    servicio_id: t.servicio_id,
    profesional_id: t.profesional_id,
    confianza: d.datos?.confianza,
    aviso: d.datos?.aviso,
  }, { hoy: d.ctx.hoy, servicios: d.ctx.servicios, profesionales: d.ctx.profesionales });

  let cliente: TurnoRespuesta['cliente'] = null;
  const buscar = turno.cliente_telefono ?? turno.cliente_nombre;
  if (buscar) {
    const lista = await d.buscarClientes(buscar).catch(() => []);
    const coinciden = turno.cliente_telefono
      ? lista.filter((c) => c.telefono.replace(/\D/g, '') === turno.cliente_telefono)
      : lista.filter((c) => mismoNombre(c.nombre, turno.cliente_nombre ?? ''));
    if (coinciden.length === 1) cliente = coinciden[0];
  }

  return { ...turno, cliente, transcripcion: d.transcripcion };
}
