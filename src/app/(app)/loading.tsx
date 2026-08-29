/**
 * Se muestra mientras el servidor arma la pantalla.
 *
 * Sin esto, al tocar una sección no pasaba nada visible hasta que llegaba el
 * HTML: con datos móviles se siente colgado y uno vuelve a tocar.
 */
export default function Cargando() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-9 w-2/3 animate-pulse rounded-xl bg-borde/60" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="tarjeta space-y-2.5 p-4">
            <div className="h-2.5 w-1/2 animate-pulse rounded bg-borde/60" />
            <div className="h-6 w-3/4 animate-pulse rounded bg-borde/70" />
            <div className="h-2.5 w-2/5 animate-pulse rounded bg-borde/50" />
          </div>
        ))}
      </div>

      <div className="tarjeta space-y-3 p-4">
        <div className="h-3 w-1/3 animate-pulse rounded bg-borde/60" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-xl bg-borde/60" />
            <div className="h-3 flex-1 animate-pulse rounded bg-borde/50" />
            <div className="h-3 w-16 animate-pulse rounded bg-borde/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
