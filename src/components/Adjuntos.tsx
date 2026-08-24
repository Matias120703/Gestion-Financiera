'use client';

import { useEffect, useRef, useState } from 'react';
import { useTextos } from '@/i18n/cliente';
import {
  borrarAdjunto, subirComprobante, traerAdjuntos, urlDeComprobante,
} from '@/lib/adjuntos';
import { mensajeDeError } from '@/lib/errores';
import type { Adjunto } from '@/lib/tipos';

const trazo = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

/**
 * El respaldo de un movimiento: fotos del comprobante y lo que se dijo en la
 * nota de voz.
 *
 * Se carga a demanda, cuando alguien despliega el movimiento. Traer los
 * adjuntos de cien filas del historial para mostrar un clip en dos sería
 * gastar red por nada.
 *
 * Las fotos se piden con URL firmada de diez minutos: el bucket es privado y
 * un enlace que no vence sería un enlace público con pasos extra.
 */
export function Adjuntos({
  empresaId, movimientoId, puedeAgregar,
}: {
  empresaId: string;
  movimientoId: string;
  /** Del plan. La base lo vuelve a comprobar igual. */
  puedeAgregar: boolean;
}) {
  const t = useTextos();
  const [lista, setLista] = useState<Adjunto[] | null>(null);
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const archivoRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let vivo = true;
    traerAdjuntos(movimientoId)
      .then((a) => { if (vivo) setLista(a); })
      .catch((e) => { if (vivo) { setError(mensajeDeError(e, t.errores.generico)); setLista([]); } });
    return () => { vivo = false; };
  }, [movimientoId, t.errores.generico]);

  async function agregar(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;

    setTrabajando(true);
    setError('');
    try {
      const nuevo = await subirComprobante({ empresaId, movimientoId, archivo });
      setLista((antes) => [...(antes ?? []), nuevo]);
    } catch (err: any) {
      setError(mensajeDeError(err, t.adjuntos.pesada));
    } finally {
      setTrabajando(false);
    }
  }

  async function quitar(id: string) {
    if (!window.confirm(t.adjuntos.borrarConfirmar)) return;
    setTrabajando(true);
    setError('');
    try {
      await borrarAdjunto(id);
      setLista((antes) => (antes ?? []).filter((a) => a.id !== id));
    } catch (err: any) {
      setError(mensajeDeError(err, t.errores.generico));
    } finally {
      setTrabajando(false);
    }
  }

  if (lista === null) {
    return <p className="text-[12.5px] font-semibold text-tinta/40">{t.comun.cargando}</p>;
  }

  const fotos = lista.filter((a) => a.tipo === 'foto');
  const voces = lista.filter((a) => a.tipo === 'audio');

  return (
    <div className="space-y-3">
      <p className="titulo-seccion">{t.adjuntos.titulo}</p>

      {/* Lo que se dijo por voz. No hay audio que reproducir a propósito:
          guardamos la transcripción, que es lo único que alguien vuelve a
          leer. Ver el comentario de la migración 007. */}
      {voces.map((v) => (
        <div key={v.id} className="flex items-start gap-2.5 rounded-xl bg-arena px-3 py-2.5">
          <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-tinta/35" {...trazo}>
            <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z" />
            <path d="M18.5 11.5A6.5 6.5 0 0 1 5.5 11.5M12 18v3.2" />
          </svg>
          <p className="text-[13px] italic leading-relaxed text-tinta/65">&laquo;{v.texto}&raquo;</p>
        </div>
      ))}

      {fotos.length === 0 && voces.length === 0 && (
        <p className="text-[13px] text-tinta/40">{t.adjuntos.ninguno}</p>
      )}

      {fotos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {fotos.map((f) => (
            <Miniatura key={f.id} adjunto={f} alBorrar={() => quitar(f.id)} etiqueta={t.adjuntos.comprobante} />
          ))}
        </div>
      )}

      {puedeAgregar && (
        <>
          <input
            ref={archivoRef} type="file" accept="image/*" capture="environment"
            className="hidden" onChange={agregar}
          />
          <button
            type="button"
            onClick={() => archivoRef.current?.click()}
            disabled={trabajando}
            className="boton-suave"
          >
            {trabajando ? t.adjuntos.subiendo : t.adjuntos.agregarFoto}
          </button>
        </>
      )}

      {!puedeAgregar && fotos.length === 0 && (
        <p className="text-[12.5px] leading-relaxed text-tinta/45">{t.captura.comprobanteBloqueado}</p>
      )}

      {error && (
        <p className="rounded-xl bg-rojo-claro px-3 py-2 text-[12.5px] font-medium text-rojo">{error}</p>
      )}
    </div>
  );
}

function Miniatura({
  adjunto, alBorrar, etiqueta,
}: {
  adjunto: Adjunto;
  alBorrar: () => void;
  etiqueta: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    if (adjunto.ruta) {
      urlDeComprobante(adjunto.ruta).then((u) => { if (vivo) setUrl(u); });
    }
    return () => { vivo = false; };
  }, [adjunto.ruta]);

  return (
    <div className="group relative">
      <a
        href={url ?? undefined}
        target="_blank"
        rel="noreferrer"
        className="block h-20 w-20 overflow-hidden rounded-xl border border-borde bg-arena"
      >
        {url ? (
          /* Va <img> y no next/image a propósito: la URL está firmada y vence
             a los diez minutos. next/image la buscaría desde el servidor para
             optimizarla y la guardaría en su caché, así que la próxima vez
             pediría una URL ya vencida y la foto no cargaría. */
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={etiqueta} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="grid h-full w-full place-items-center text-tinta/25">
            <svg viewBox="0 0 24 24" className="h-5 w-5" {...trazo}>
              <path d="M3.5 8.5h3l1.5-2.5h8L17.5 8.5h3v10h-17z" /><circle cx="12" cy="13" r="3.2" />
            </svg>
          </span>
        )}
      </a>

      <button
        type="button"
        onClick={alBorrar}
        aria-label={etiqueta}
        className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-white text-tinta/50 shadow ring-1 ring-borde transition hover:text-rojo"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...trazo}><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </div>
  );
}
