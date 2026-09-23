'use client';

import { useCallback, useEffect, useState } from 'react';
import { clienteNavegador } from '@/lib/supabase/cliente';
import type { EstadoPush } from '@/lib/invitar-avisos';
import { CLAVE_INVITACION, leerHistorialInvitacion, noVolverAInvitar } from '@/lib/invitar-avisos';

export type { EstadoPush };

/**
 * EL ALTA DEL NAVEGADOR PARA RECIBIR PUSH, EN UN SOLO LUGAR.
 *
 * Vivía adentro del botón de Ajustes › Avisos. Desde el 23/09 la usa también
 * la hoja que ofrece prender los avisos al entrar al panel
 * (components/InvitarAvisos.tsx), y dos copias de esto son dos lugares donde
 * el día de mañana uno pide el permiso distinto que el otro.
 *
 * Cada navegador es una suscripción distinta: el celular y la computadora se
 * dan de alta por separado. Por eso el estado se lee del propio navegador y
 * no de la base.
 *
 * 'iphone-sin-instalar' es el 'no-soportado' de un iPhone que no tiene Orden
 * en la pantalla de inicio: Safari en una pestaña no ofrece push, y no es
 * que el teléfono no pueda, es que falta un paso. Separarlo permite explicar
 * ese paso en vez de decir «no se puede».
 */
export function usePush() {
  const [estado, setEstado] = useState<EstadoPush>('cargando');
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    let vivo = true;

    (async () => {
      if (typeof window === 'undefined') return;

      // Primero lo nuestro. Sin la clave pública VAPID no hay push posible
      // en ningún navegador, así que preguntar por el navegador antes que
      // por esto haría que a TODO el mundo se le eche la culpa a su
      // teléfono por algo que es de nuestra configuración. Y se comprueba
      // al cargar y no al tocar el botón: enterarse antes de intentarlo
      // ahorra el «no pasó nada» que no se entiende.
      if (!process.env.NEXT_PUBLIC_VAPID_PUBLICA) {
        if (vivo) setEstado('sin-configurar');
        return;
      }

      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        if (vivo) setEstado(esIphoneSinInstalar() ? 'iphone-sin-instalar' : 'no-soportado');
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

  /**
   * Pide el permiso y da de alta este navegador. Tiene que llamarse desde un
   * toque: sin ese gesto, el navegador ni muestra la pregunta.
   *
   * Devuelve cómo quedó, para que quien la llama sepa qué decir sin esperar
   * a que React vuelva a dibujar.
   */
  const activar = useCallback(async (): Promise<EstadoPush> => {
    setTrabajando(true);
    let final: EstadoPush = 'apagado';
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') {
        final = permiso === 'denied' ? 'bloqueado' : 'apagado';
        return final;
      }

      // Ya se comprobó al cargar, así que acá no debería entrar nunca. Se
      // deja igual porque el día que se cuele, tiene que decir la verdad.
      const publica = process.env.NEXT_PUBLIC_VAPID_PUBLICA;
      if (!publica) { final = 'sin-configurar'; return final; }

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

      final = 'encendido';
      return final;
    } catch {
      final = 'apagado';
      return final;
    } finally {
      setEstado(final);
      setTrabajando(false);
    }
  }, []);

  const desactivar = useCallback(async () => {
    setTrabajando(true);
    try {
      const registro = await navigator.serviceWorker.ready;
      const suscripcion = await registro.pushManager.getSubscription();
      if (suscripcion) {
        const supabase = clienteNavegador();
        await supabase.rpc('borrar_dispositivo', { p_endpoint: suscripcion.endpoint });
        await suscripcion.unsubscribe();
      }
      // Los apagó a propósito: la hoja del panel no se los vuelve a ofrecer.
      // Si algún día los quiere, están en Ajustes › Avisos.
      try {
        const h = leerHistorialInvitacion(localStorage.getItem(CLAVE_INVITACION));
        localStorage.setItem(CLAVE_INVITACION, JSON.stringify(noVolverAInvitar(h)));
      } catch { /* sin almacenamiento: no pasa nada */ }
      setEstado('apagado');
    } finally {
      setTrabajando(false);
    }
  }, []);

  return { estado, trabajando, activar, desactivar };
}

/**
 * En iPhone, push solo funciona si la app está agregada a la pantalla de
 * inicio. Detectarlo permite explicar por qué el botón no aparece, en vez de
 * dejar a la persona pensando que la app está rota.
 */
export function esIphoneSinInstalar(): boolean {
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
