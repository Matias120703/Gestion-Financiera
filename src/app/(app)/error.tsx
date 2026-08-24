'use client';

import { useEffect } from 'react';

/**
 * Pantalla de error de las secciones internas.
 *
 * Aparece cuando una lectura falla. Es deliberadamente distinta de un estado
 * vacío: si no pudimos leer los datos, NO mostramos "Gs. 0". Un cero es un
 * dato; esto es la ausencia de datos, y hay que decirlo.
 */
export default function ErrorDeSeccion({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[pantalla]', error.message, error.digest ?? '');
  }, [error]);

  const esLectura = error.name === 'ErrorDeLectura' || /no se pudieron cargar/i.test(error.message);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="tarjeta w-full max-w-md p-6 text-center aparecer">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-ambar-claro text-ambar">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor"
            strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 8.5v5M12 16.8v.2" />
            <path d="M10.3 3.9 2.6 17.4A2 2 0 0 0 4.3 20.4h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
        </span>

        <h1 className="mt-4 text-[19px] font-bold tracking-tight">
          {esLectura ? 'No pudimos cargar tus datos' : 'Algo salió mal'}
        </h1>

        <p className="mt-2 text-[14px] leading-relaxed text-tinta/60">
          {esLectura ? (
            <>
              No es que no tengas movimientos: es que la consulta no llegó a
              completarse. Puede ser la conexión o algo puntual del servidor.
              <strong className="block pt-2 text-tinta">
                Ningún número de esta pantalla sería confiable ahora mismo, así que
                preferimos no mostrarte ninguno.
              </strong>
            </>
          ) : (
            'Ocurrió un problema inesperado en esta sección. Tus datos están a salvo.'
          )}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-2.5">
          <button type="button" className="boton-suave py-3" onClick={() => window.location.reload()}>
            Recargar
          </button>
          <button type="button" className="boton-principal py-3" onClick={reset}>
            Reintentar
          </button>
        </div>

        {error.digest && (
          <p className="mt-4 text-[11.5px] text-tinta/35">
            Código para soporte: <span className="font-mono">{error.digest}</span>
          </p>
        )}
      </div>
    </div>
  );
}
