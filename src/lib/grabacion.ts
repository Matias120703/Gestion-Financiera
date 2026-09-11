'use client';

import { useEffect, useRef, useState } from 'react';

/** El primer formato de audio que el navegador sabe grabar. Safari graba mp4. */
function mimeSoportado(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

/**
 * GRABAR UNA NOTA DE VOZ
 *
 * Nació para dictar turnos. La captura de movimientos tiene la misma lógica
 * adentro, escrita antes de que hubiera un segundo lugar que grabara.
 *
 * `alTerminar` recibe el audio cuando se toca «Listo». Si se cancela no se
 * llama: lo grabado se tira.
 */
export function useGrabacion(alTerminar: (audio: Blob, nombre: string) => void) {
  const [grabando, setGrabando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const grabadora = useRef<MediaRecorder | null>(null);
  const trozos = useRef<Blob[]>([]);
  const reloj = useRef<ReturnType<typeof setInterval> | null>(null);
  // Siempre la última versión: la que se pasó al empezar puede tener un
  // estado viejo adentro para cuando se toca «Listo».
  const terminar = useRef(alTerminar);
  terminar.current = alTerminar;

  // Si la pantalla se cierra grabando, se suelta el micrófono. Si no, el
  // celular sigue mostrando que algo lo está usando.
  useEffect(() => () => {
    if (reloj.current) clearInterval(reloj.current);
    const g = grabadora.current;
    if (!g) return;
    g.onstop = null;
    g.stream.getTracks().forEach((t) => t.stop());
    if (g.state !== 'inactive') g.stop();
  }, []);

  /** Devuelve false si no hay micrófono o no dieron permiso. */
  async function empezar(): Promise<boolean> {
    try {
      const flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tipo = mimeSoportado();
      const g = new MediaRecorder(flujo, tipo ? { mimeType: tipo } : undefined);
      trozos.current = [];
      g.ondataavailable = (e) => { if (e.data.size > 0) trozos.current.push(e.data); };
      g.onstop = () => {
        flujo.getTracks().forEach((t) => t.stop());
        const audio = new Blob(trozos.current, { type: tipo || 'audio/webm' });
        const ext = (tipo || 'audio/webm').includes('mp4') ? 'mp4' : 'webm';
        terminar.current(audio, `nota.${ext}`);
      };
      g.start();
      grabadora.current = g;
      setSegundos(0);
      setGrabando(true);
      reloj.current = setInterval(() => setSegundos((s) => s + 1), 1000);
      return true;
    } catch {
      return false;
    }
  }

  /** Terminar. Con `cancelar`, lo grabado se tira. */
  function parar(cancelar = false) {
    if (reloj.current) clearInterval(reloj.current);
    setGrabando(false);
    const g = grabadora.current;
    grabadora.current = null;
    if (!g) return;
    if (cancelar) {
      g.onstop = null;
      g.stream.getTracks().forEach((t) => t.stop());
    }
    g.stop();
  }

  return { grabando, segundos, empezar, parar };
}
