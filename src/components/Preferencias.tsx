'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { useIdioma, useTextos, aplicarIdioma } from '@/i18n/cliente';
import { FICHA, IDIOMAS, type Idioma } from '@/i18n/idiomas';
import { mensajeDeError } from '@/lib/errores';
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
export function SelectorIdioma() {
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
 * Cada navegador es una suscripción distinta: el celular y la computadora se
 * dan de alta por separado. Por eso el estado se lee del propio navegador y
 * no de la base.
 */
function BotonPush() {
  const t = useTextos();
  const [estado, setEstado] = useState<'cargando' | 'no-soportado' | 'bloqueado' | 'apagado' | 'encendido'>('cargando');
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    let vivo = true;

    (async () => {
      if (typeof window === 'undefined') return;
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        if (vivo) setEstado('no-soportado');
        return;
      }
      if (Notification.permission === 'denied') {
        if (vivo) setEstado('bloqueado');
        return;
      }

      const registro = await navigator.serviceWorker.ready.catch(() => null);
      const suscripcion = await registro?.pushManager.getSubscription().catch(() => null);
      if (vivo) setEstado(suscripcion ? 'encendido' : 'apagado');
    })();

    return () => { vivo = false; };
  }, []);

  async function activar() {
    setTrabajando(true);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') { setEstado(permiso === 'denied' ? 'bloqueado' : 'apagado'); return; }

      const publica = process.env.NEXT_PUBLIC_VAPID_PUBLICA;
      if (!publica) { setEstado('no-soportado'); return; }

      const registro = await navigator.serviceWorker.ready;
      const suscripcion = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: aUint8(publica),
      });

      const json = suscripcion.toJSON();
      const supabase = clienteNavegador();
      await supabase.rpc('registrar_dispositivo', {
        p_endpoint: suscripcion.endpoint,
        p_p256dh: json.keys?.p256dh ?? '',
        p_auth: json.keys?.auth ?? '',
        p_navegador: navigator.userAgent.slice(0, 200),
      });

      setEstado('encendido');
    } catch {
      setEstado('apagado');
    } finally {
      setTrabajando(false);
    }
  }

  async function desactivar() {
    setTrabajando(true);
    try {
      const registro = await navigator.serviceWorker.ready;
      const suscripcion = await registro.pushManager.getSubscription();
      if (suscripcion) {
        const supabase = clienteNavegador();
        await supabase.rpc('borrar_dispositivo', { p_endpoint: suscripcion.endpoint });
        await suscripcion.unsubscribe();
      }
      setEstado('apagado');
    } finally {
      setTrabajando(false);
    }
  }

  if (estado === 'cargando') return null;

  if (estado === 'no-soportado') {
    return <Nota texto={`${t.ajustes.pushNoSoportado} ${esIphoneSinInstalar() ? t.ajustes.pushIphone : ''}`.trim()} />;
  }
  if (estado === 'bloqueado') return <Nota texto={t.ajustes.pushBloqueado} />;

  return (
    <div className="rounded-xl border border-borde p-3.5">
      {estado === 'encendido' ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[14px] font-semibold text-verde-fuerte">{t.ajustes.pushActivo}</p>
          <button type="button" onClick={desactivar} disabled={trabajando} className="boton-texto text-tinta/50">
            {t.comun.cerrar}
          </button>
        </div>
      ) : (
        <button type="button" onClick={activar} disabled={trabajando} className="boton-suave w-full">
          {trabajando ? t.comun.cargando : t.ajustes.activarPush}
        </button>
      )}
      {esIphoneSinInstalar() && <p className="mt-2 text-[12px] leading-relaxed text-tinta/45">{t.ajustes.pushIphone}</p>}
    </div>
  );
}

function Nota({ texto }: { texto: string }) {
  return (
    <p className="rounded-xl bg-arena px-3.5 py-3 text-[13px] leading-relaxed text-tinta/55">{texto}</p>
  );
}

/**
 * En iPhone, push solo funciona si la app está agregada a la pantalla de
 * inicio. Detectarlo permite explicar por qué el botón no aparece, en vez de
 * dejar a la persona pensando que la app está rota.
 */
function esIphoneSinInstalar(): boolean {
  if (typeof window === 'undefined') return false;
  const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const instalada = window.matchMedia('(display-mode: standalone)').matches
    || (navigator as any).standalone === true;
  return esIOS && !instalada;
}

/**
 * La clave VAPID viaja en base64url y `subscribe` la pide en bytes.
 *
 * Se construye sobre un ArrayBuffer explícito y no con `new Uint8Array(n)`
 * porque el tipo de `applicationServerKey` exige un ArrayBuffer y no acepta
 * el `ArrayBufferLike` genérico, que también podría ser compartido.
 */
function aUint8(base64url: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const crudo = atob(base64);
  const salida = new Uint8Array(new ArrayBuffer(crudo.length));
  for (let i = 0; i < crudo.length; i++) salida[i] = crudo.charCodeAt(i);
  return salida;
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
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}
