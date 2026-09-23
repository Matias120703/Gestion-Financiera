'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { useIdioma, useTextos, aplicarIdioma } from '@/i18n/cliente';
import { FICHA, IDIOMAS, type Idioma, IDIOMA_UNICO } from '@/i18n/idiomas';
import { aplicarTema, guardarTema, leerTema, type Tema } from '@/lib/tema';
import { mensajeDeError } from '@/lib/errores';
import { GuiaInstalar } from '@/components/GuiaInstalar';
import { usePush, esIphoneSinInstalar } from '@/lib/push-cliente';
import Link from 'next/link';
import type { Preferencias as Prefs } from '@/lib/tipos';

/**
 * Preferencias de la PERSONA, no del negocio.
 *
 * El idioma es de cada uno: en un local pueden trabajar alguien que lee
 * español y alguien que lee portugués, y el negocio es uno solo.
 *
 * El cambio de idioma se aplica por cookie ANTES de guardarlo en la base. Si
 * la red está mal, la persona igual ve la app en su idioma; la preferencia se
 * sincroniza en el próximo intento. Al revés —esperar a la base para cambiar
 * lo que se ve— sería hacerla mirar una pantalla que no entiende mientras
 * carga.
 */
/**
 * El selector de idioma.
 *
 * No se muestra mientras `IDIOMA_UNICO` esté puesto: ofrecer un cambio de
 * idioma que deja la mitad de las pantallas sin traducir es peor que no
 * ofrecerlo. Vuelve solo cuando esa constante sea `null`.
 */
export function SelectorIdioma() {
  // Los hooks van SIEMPRE antes de cualquier salida: React exige que se
  // llamen en el mismo orden en cada dibujado, y una salida temprana arriba
  // los saltea. Es lo que avisó el lint al escribir esto.
  const actual = useIdioma();
  const t = useTextos();

  async function elegir(idioma: Idioma) {
    if (idioma === actual) return;

    // Se guarda sin bloquear: si falla, la cookie ya cambió lo que se ve.
    try {
      const supabase = clienteNavegador();
      await supabase.rpc('guardar_preferencias', { p_idioma: idioma });
    } catch {
      // Silencio a propósito: recargar en el idioma correcto es lo que
      // importa. La preferencia se vuelve a intentar la próxima vez.
    }
    aplicarIdioma(idioma);
  }

  // Recién acá, con los hooks ya llamados.
  if (IDIOMA_UNICO) return null;

  return (
    <div>
      <p className="etiqueta">{t.ajustes.idioma}</p>
      <div className="flex flex-wrap gap-2">
        {IDIOMAS.map((idioma) => (
          <button
            key={idioma}
            type="button"
            onClick={() => elegir(idioma)}
            lang={idioma}
            className={idioma === actual ? 'chip-encendido' : 'chip-apagado'}
          >
            <span className="mr-1.5" aria-hidden>{FICHA[idioma].bandera}</span>
            {FICHA[idioma].nombre}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-tinta/45">{t.ajustes.idiomaDetalle}</p>
    </div>
  );
}

/**
 * Interruptores de avisos + alta del dispositivo para push.
 *
 * `esPersonal` solo cambia cómo se llama el primer aviso. Es el mismo
 * interruptor y la misma preferencia guardada: lo que cambia es que a una
 * persona no se le puede ofrecer «cerrar el día», porque esa pantalla no
 * existe en su cuenta y ese recorte del tiempo no es el suyo.
 */
export function AjustesDeAvisos({
  inicial, esPersonal = false, tieneAgenda = false,
}: { inicial: Prefs; esPersonal?: boolean; tieneAgenda?: boolean }) {
  const t = useTextos();
  const router = useRouter();
  const [prefs, setPrefs] = useState<Prefs>(inicial);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  async function guardar(cambio: Partial<Prefs>) {
    const siguiente = { ...prefs, ...cambio };
    setPrefs(siguiente);
    setError('');
    try {
      const supabase = clienteNavegador();
      const { error: e } = await supabase.rpc('guardar_preferencias', {
        p_aviso_cierre: siguiente.aviso_cierre,
        p_aviso_semanal: siguiente.aviso_semanal,
        p_hora_cierre: siguiente.hora_cierre,
        p_aviso_turnos: siguiente.aviso_turnos,
        p_aviso_diario: siguiente.aviso_diario,
      });
      if (e) throw e;
      setMensaje(t.ajustes.guardado);
      setTimeout(() => setMensaje(''), 2500);
      router.refresh();
    } catch (e: any) {
      setPrefs(prefs);  // se vuelve atrás: mostrar el interruptor encendido
      setError(mensajeDeError(e, t.errores.generico));  // cuando no se guardó sería mentir
    }
  }

  return (
    <div className="space-y-4">
      <Interruptor
        titulo={esPersonal ? t.ajustes.avisoCarga : t.ajustes.avisoCierre}
        detalle={esPersonal ? t.ajustes.avisoCargaDetalle : t.ajustes.avisoCierreDetalle}
        encendido={prefs.aviso_cierre}
        alCambiar={(v) => guardar({ aviso_cierre: v })}
      />

      {prefs.aviso_cierre && (
        <label className="block pl-1">
          <span className="etiqueta">{t.ajustes.horaCierre}</span>
          <select
            className="campo max-w-[140px]"
            value={prefs.hora_cierre}
            onChange={(e) => guardar({ hora_cierre: Number(e.target.value) })}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
            ))}
          </select>
        </label>
      )}

      <Interruptor
        titulo={t.ajustes.avisoDiario}
        detalle={t.ajustes.avisoDiarioDetalle}
        encendido={prefs.aviso_diario ?? true}
        alCambiar={(v) => guardar({ aviso_diario: v })}
      />

      <Interruptor
        titulo={t.ajustes.avisoSemanal}
        detalle={t.ajustes.avisoSemanalDetalle}
        encendido={prefs.aviso_semanal}
        alCambiar={(v) => guardar({ aviso_semanal: v })}
      />

      {/* Solo donde hay agenda: ofrecerle apagar un aviso que nunca le va
          a llegar es ruido en la pantalla de ajustes. */}
      {tieneAgenda && (
        <Interruptor
          titulo={t.ajustes.avisoTurnos}
          detalle={t.ajustes.avisoTurnosDetalle}
          encendido={prefs.aviso_turnos}
          alCambiar={(v) => guardar({ aviso_turnos: v })}
        />
      )}

      <BotonPush />

      {mensaje && <p className="text-[13px] font-semibold text-verde-fuerte">{mensaje}</p>}
      {error && <p className="rounded-xl bg-rojo-claro px-3 py-2 text-[13px] font-medium text-rojo">{error}</p>}
    </div>
  );
}

/**
 * Alta del navegador para recibir push.
 *
 * La lógica (estado, permiso, alta y baja del dispositivo) vive en
 * lib/push-cliente.ts desde que también la usa la invitación del panel
 * (InvitarAvisos, 23/09). Acá queda lo que es de Ajustes: el botón, probar
 * y desactivar.
 */
function BotonPush() {
  const t = useTextos();
  const { estado, trabajando, activar, desactivar } = usePush();
  // Null mientras no se probó; después, lo que contestó el servidor.
  const [prueba, setPrueba] = useState<null | 'yendo' | 'llego' | 'fallo'>(null);

  // Ver src/app/api/avisos/probar/route.ts: el aviso sale a los
  // dispositivos de uno mismo, para separar «no llega» de «no hay qué decir».
  async function probar() {
    setPrueba('yendo');
    try {
      const r = await fetch('/api/avisos/probar', { method: 'POST' });
      const j = await r.json().catch(() => ({ ok: false }));
      setPrueba(j?.ok ? 'llego' : 'fallo');
    } catch {
      setPrueba('fallo');
    }
  }

  if (estado === 'cargando') return null;

  if (estado === 'sin-configurar') return <Nota texto={t.ajustes.pushSinConfigurar} />;
  // 'iphone-sin-instalar' es el 'no-soportado' de un iPhone en una pestaña de
  // Safari: acá se sigue mostrando como siempre, la nota con el paso que falta.
  if (estado === 'no-soportado' || estado === 'iphone-sin-instalar') {
    return <Nota texto={`${t.ajustes.pushNoSoportado} ${esIphoneSinInstalar() ? t.ajustes.pushIphone : ''}`.trim()} />;
  }
  if (estado === 'bloqueado') return <Nota texto={t.ajustes.pushBloqueado} />;

  return (
    <div className="rounded-xl border border-borde p-3.5">
      {estado === 'encendido' ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[14px] font-semibold text-verde-fuerte">{t.ajustes.pushActivo}</p>
            <div className="flex shrink-0 items-center gap-3">
              <button type="button" onClick={probar} disabled={prueba === 'yendo'} className="boton-texto">
                {prueba === 'yendo' ? t.ajustes.probandoAviso : t.ajustes.probarAviso}
              </button>
              <button type="button" onClick={desactivar} disabled={trabajando} className="boton-texto text-tinta/50">
                {t.comun.cerrar}
              </button>
            </div>
          </div>
          {(prueba === 'llego' || prueba === 'fallo') && (
            <p className={`mt-2 text-[12.5px] leading-snug ${prueba === 'llego' ? 'text-tinta/55' : 'text-rojo'}`}>
              {prueba === 'llego' ? t.ajustes.avisoLlego : t.ajustes.avisoNoSalio}
            </p>
          )}
        </>
      ) : (
        <button type="button" onClick={() => { void activar(); }} disabled={trabajando} className="boton-suave w-full">
          {trabajando ? t.comun.cargando : t.ajustes.activarPush}
        </button>
      )}
      {esIphoneSinInstalar() && (
        <div className="mt-3 border-t border-borde pt-3">
          <p className="text-[13px] font-semibold text-tinta/70">{t.ajustes.pushIphone}</p>
          <div className="mt-3">
            <GuiaInstalar compacta />
          </div>
          <p className="mt-3 text-[12px] text-tinta/40">
            <Link href="/instalar" target="_blank" className="font-semibold text-verde-fuerte hover:underline">
              {t.ajustes.guiaEnSuPagina}
            </Link>
            {' '}{t.ajustes.paraMandarla}
          </p>
        </div>
      )}
    </div>
  );
}

function Nota({ texto }: { texto: string }) {
  return (
    <p className="rounded-xl bg-arena px-3.5 py-3 text-[13px] leading-relaxed text-tinta/55">{texto}</p>
  );
}

function Interruptor({
  titulo, detalle, encendido, alCambiar,
}: {
  titulo: string;
  detalle: string;
  encendido: boolean;
  alCambiar: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold">{titulo}</span>
        <span className="mt-0.5 block text-[12.5px] leading-relaxed text-tinta/50">{detalle}</span>
      </span>
      <span className="relative mt-0.5 shrink-0">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={encendido}
          onChange={(e) => alCambiar(e.target.checked)}
        />
        <span className="block h-6 w-11 rounded-full bg-borde transition peer-checked:bg-verde" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-superficie shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

/**
 * CLARO, OSCURO O COMO EL TELÉFONO.
 *
 * Tres opciones y no un interruptor, porque «como el sistema» es el que hace
 * que la app se ponga oscura sola a la noche sin que nadie toque nada. Es el
 * que viene puesto.
 *
 * Vive en el navegador y no en la cuenta: es de ESTE aparato. La misma
 * persona puede querer la app clara en la computadora del local y oscura en
 * el celular de noche, y guardarlo en la cuenta le impondría una sola
 * respuesta a los dos.
 */
export function SelectorTema() {
  const t = useTextos();
  const [tema, setTema] = useState<Tema>('sistema');

  // El valor real se lee después del montaje: en el servidor no hay
  // localStorage, y pintar una opción distinta de la guardada rompe la
  // hidratación. El tema en sí ya se aplicó antes, desde el guion del layout.
  useEffect(() => { setTema(leerTema()); }, []);

  // Con «como el sistema» hay que seguir escuchando: si el teléfono cambia a
  // oscuro a las siete de la tarde, la app tiene que acompañarlo sin recargar.
  useEffect(() => {
    if (tema !== 'sistema') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const alCambiar = () => aplicarTema('sistema');
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, [tema]);

  const OPCIONES: { valor: Tema; texto: string; icono: React.ReactNode }[] = [
    {
      valor: 'claro', texto: t.ajustes.temaClaro,
      icono: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" {...trazoTema}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
        </svg>
      ),
    },
    {
      valor: 'oscuro', texto: t.ajustes.temaOscuro,
      icono: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" {...trazoTema}>
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
        </svg>
      ),
    },
    {
      valor: 'sistema', texto: t.ajustes.temaSistema,
      icono: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" {...trazoTema}>
          <rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M10 18h4" />
        </svg>
      ),
    },
  ];

  return (
    <div>
      <p className="etiqueta">{t.ajustes.colores}</p>
      <div className="flex flex-wrap gap-2">
        {OPCIONES.map((o) => (
          <button
            key={o.valor}
            type="button"
            onClick={() => { setTema(o.valor); guardarTema(o.valor); }}
            className={o.valor === tema ? 'chip-encendido' : 'chip-apagado'}
          >
            <span className="mr-1.5 inline-block align-[-2px]" aria-hidden>{o.icono}</span>
            {o.texto}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-tinta/45">
        {t.ajustes.temaDeEsteAparato}
      </p>
    </div>
  );
}

const trazoTema = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};
