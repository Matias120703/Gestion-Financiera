/**
 * RUTINAS, MEDIDAS Y PROGRESO DEL PERSONAL TRAINER (098): LA FORMA DE LOS DATOS.
 *
 * Es el contrato entre la base y las pantallas: cada función de la 098
 * devuelve exactamente estas claves. Si una cambia acá, cambia en la función,
 * y al revés. Va en su propio archivo y no en tipos.ts porque se compila
 * suelto con las librerías de rutina-texto.ts y medidas.ts para las pruebas.
 */

/** Los grupos musculares de la biblioteca: el check de `ejercicios.grupo`. */
export type GrupoEjercicio =
  | 'piernas' | 'gluteos' | 'pecho' | 'espalda' | 'hombros'
  | 'brazos' | 'core' | 'cardio' | 'movilidad' | 'otro';

export type EstadoRutina = 'plantilla' | 'borrador' | 'vigente' | 'anterior';

/** Un ejercicio de la biblioteca del negocio (`ejercicios_de`). */
export interface EjercicioBiblioteca {
  id: string;
  nombre: string;
  grupo: GrupoEjercicio | null;
  /** «Cómo se hace». Lo ve el cliente en su link. */
  indicaciones: string;
  video_url: string | null;
  activo: boolean;
  /** En cuántos renglones de rutinas está. */
  usos: number;
}

/** Un ejercicio dentro de un día de una rutina. */
export interface EjercicioDeRutina {
  /** El id del renglón (rutina_ejercicios): se conserva al guardar. */
  id: string;
  orden: number;
  ejercicio_id: string;
  nombre: string;
  grupo: GrupoEjercicio | null;
  indicaciones: string;
  video_url: string | null;
  series: number | null;
  /** Texto: «10», «8-12», «12-10-8», «45 s», «al fallo». */
  reps: string;
  /** Texto tal cual lo escribió el trainer: «40 kg», «25 lb», «banda roja». Nunca se le agrega unidad. */
  carga: string;
  descanso_seg: number | null;
  /** Lo ve el cliente. */
  nota: string;
  /** Superserie: va junto al anterior (2a / 2b). */
  junto_al_anterior: boolean;
}

export interface DiaDeRutina {
  id: string;
  orden: number;
  /** «Día A · Piernas». */
  nombre: string;
  /** Entrada en calor, vuelta a la calma. Lo ve el cliente. */
  notas: string;
  ejercicios: EjercicioDeRutina[];
}

/** Una rutina entera (`rutina`). */
export interface RutinaCompleta {
  id: string;
  cliente_id: string | null;
  cliente_nombre: string | null;
  /** «Salud y lesiones» del cliente, para el aviso del editor: la ve todo el equipo, y nunca se copia a la rutina. Null en una plantilla. */
  cliente_notas: string | null;
  estado: EstadoRutina;
  nombre: string;
  notas: string;
  desde: string | null;
  hasta: string | null;
  semanas: number | null;
  version: number;
  updated_at: string;
  dias: DiaDeRutina[];
}

/** Lo que se manda a `guardar_rutina` en `p_datos`. Los ids que vienen se conservan. */
export interface RutinaParaGuardar {
  nombre: string;
  notas: string;
  desde?: string | null;
  semanas: number | null;
  dias: {
    id?: string;
    nombre: string;
    notas: string;
    ejercicios: {
      id?: string;
      /** Uno de los dos: el id de la biblioteca o el nombre (se busca o se crea). */
      ejercicio_id?: string;
      nombre?: string;
      series: number | null;
      reps: string;
      carga: string;
      descanso_seg: number | null;
      nota: string;
      junto_al_anterior: boolean;
    }[];
  }[];
}

export interface RespuestaGuardarRutina {
  id: string;
  estado: EstadoRutina;
  version: number;
  /** El link del cliente cuando la rutina quedó vigente; si no, null. */
  token: string | null;
}

export interface RespuestaCopiarRutina {
  id: string;
  estado: EstadoRutina;
  token: string | null;
}

export interface EnlaceRutina {
  token: string;
  activo: boolean;
}

export interface ResumenVigente {
  id: string;
  nombre: string;
  desde: string;
  semanas: number | null;
  /** desde + semanas × 7, o null si no se puso cuándo cambiarla. */
  cambia_el: string | null;
  updated_at: string;
}

export type MotivoAtender = 'sin_rutina' | 'cambiar' | 'medir';

/** La pantalla /rutinas (`rutinas_de`). */
export interface RutinasDelNegocio {
  clientes: {
    id: string;
    nombre: string;
    telefono: string;
    vigente: ResumenVigente | null;
    borrador_id: string | null;
    enlace: EnlaceRutina | null;
    /** Solo para el dueño o un admin; si no, null. */
    ultima_medicion: string | null;
    entrenando: boolean;
  }[];
  para_atender: { cliente_id: string; nombre: string; motivo: MotivoAtender }[];
  plantillas: { id: string; nombre: string; semanas: number | null; dias: number; ejercicios: number; updated_at: string }[];
}

/** La carpeta de una persona (`rutinas_del_cliente`). */
export interface CarpetaCliente {
  cliente: {
    id: string;
    nombre: string;
    telefono: string;
    /** «Salud y lesiones»: la ve todo el equipo (el cliente nunca). */
    notas: string | null;
  };
  vigente: RutinaCompleta | null;
  borrador: { id: string; nombre: string; updated_at: string } | null;
  anteriores: { id: string; nombre: string; desde: string; hasta: string | null }[];
  enlace: EnlaceRutina | null;
  entrenando: boolean;
}

/** Lo que ve el cliente en su link (`rutina_por_token`). Las claves son EXACTAMENTE estas. */
export type RutinaPublica =
  | { existe: false }
  | {
      existe: true;
      negocio: string;
      /** Solo el nombre de pila. */
      nombre: string;
      /** La cuenta del trainer venció hace más de 30 días: no se muestra la rutina. */
      renovar: boolean;
      actualizada: string | null;
      rutina: null | {
        nombre: string;
        notas: string;
        desde: string | null;
        dias: {
          orden: number;
          nombre: string;
          notas: string;
          ejercicios: {
            /** El id del renglón: sirve para los tildes guardados en el celular. */
            id: string;
            orden: number;
            nombre: string;
            series: number | null;
            reps: string;
            carga: string;
            descanso_seg: number | null;
            nota: string;
            junto: boolean;
            video: string | null;
            /** «Cómo se hace», de la biblioteca. */
            como: string;
          }[];
        }[];
      };
    };

/** Las columnas medibles de `mediciones`. */
export type ClaveMedida =
  | 'peso_kg' | 'altura_cm' | 'cintura_cm' | 'cadera_cm' | 'pecho_cm'
  | 'brazo_cm' | 'muslo_cm' | 'grasa_pct' | 'pantorrilla_cm' | 'cuello_cm';

export type MetodoGrasa = 'balanza' | 'plicometro' | 'cinta' | 'otro';

/** Un control (una fila de `mediciones`). */
export interface Medicion {
  id: string;
  fecha: string;
  peso_kg: number | null;
  altura_cm: number | null;
  cintura_cm: number | null;
  cadera_cm: number | null;
  pecho_cm: number | null;
  brazo_cm: number | null;
  muslo_cm: number | null;
  grasa_pct: number | null;
  grasa_metodo: MetodoGrasa | null;
  pantorrilla_cm: number | null;
  cuello_cm: number | null;
  nota: string;
}

export interface RespuestaAnotarMedicion {
  id: string;
  /** Ya había un control ese día y se completó. */
  fusionada: boolean;
  /** Lo que tenía valor y cambió al completar. */
  cambios: { campo: ClaveMedida | 'grasa_metodo' | 'nota'; antes: string | number | null; despues: string | number | null }[];
}

export interface CambioCarga {
  fecha: string;
  carga_antes: string | null;
  carga_despues: string | null;
  reps_antes: string | null;
  reps_despues: string | null;
}

/** El progreso de una persona (`progreso_de`). Solo el dueño o un admin. */
export interface ProgresoCliente {
  cliente: { id: string; nombre: string; telefono: string };
  consiente_medidas_at: string | null;
  mediciones: Medicion[];
  rutina_vigente: { nombre: string; desde: string } | null;
  cargas: { ejercicio_id: string; nombre: string; cambios: CambioCarga[] }[];
}

/** La rutina de cada sesión de la agenda (`rutinas_de_la_agenda`), por id de reserva. */
export type RutinasDeLaAgenda = Record<string, { rutina_id: string; nombre: string }>;

// ─────────────────────────── librerías puras ───────────────────────────

/** Una medida del catálogo (src/lib/medidas.ts). Los nombres visibles van en el diccionario. */
export interface MedidaDef {
  clave: ClaveMedida;
  unidad: 'kg' | 'cm' | '%';
  minimo: number;
  maximo: number;
  decimales: number;
  /** Aparece en el formulario sin tocar «Más medidas». */
  porDefecto: boolean;
}

/** Un ejercicio leído de un renglón o de un texto pegado (src/lib/rutina-texto.ts). */
export interface EjercicioLeido {
  nombre: string;
  series: number | null;
  reps: string;
  carga: string;
  descanso_seg: number | null;
  nota: string;
  junto_al_anterior: boolean;
}

export interface RutinaLeida {
  nombre: string | null;
  dias: { nombre: string; notas: string; ejercicios: EjercicioLeido[] }[];
  /** Los renglones que no se entendieron: se muestran, nunca se inventan. */
  noEntendidas: string[];
}

/** Las etiquetas que `rutinaComoTexto` necesita, sacadas del diccionario (t.rutinasComun.texto). */
export interface TextosRutinaTexto {
  /** «series» */
  series: string;
  /** «Descanso» */
  descanso: string;
  /** «Carga»: para escribir una carga cuando no hay series. */
  carga: string;
  /** «Nota» */
  nota: string;
  /** «Junto con el anterior» */
  superserie: string;
}
