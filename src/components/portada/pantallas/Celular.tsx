import { Marca } from '@/components/Marca';

/**
 * EL CELULAR DE LA VITRINA (24/09).
 *
 * No es una captura ni una imagen: es HTML con las mismas clases de la app
 * (`tarjeta`, `pastilla`, la barra de vidrio de Navegacion.tsx, el botón
 * verde de la captura), así que se ve en claro o en oscuro según el tema de
 * quien mira, igual que la app de verdad, y no pesa nada.
 *
 * Todo lo de adentro es decorado para un lector de pantalla: el marco es un
 * `role="img"` con un resumen escrito de lo que muestra (`resumen`). Leerle
 * «9:41», cada ícono de la barra y cada renglón de números de ejemplo sería
 * ruido; el resumen dice lo mismo en una frase.
 *
 * El alto es fijo: cambiar de rubro no puede hacer saltar la página. Lo que
 * no entra pasa por detrás de la barra de vidrio, como cuando se hace scroll
 * en el teléfono.
 */

export type IconoBarra =
  | 'panel' | 'vender' | 'gastos' | 'cierre' | 'agenda' | 'clientes' | 'rutinas' | 'lotes' | 'deudas' | 'organizacion';

export interface ItemBarra {
  icono: IconoBarra;
  texto: string;
}

const trazo = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

/** Los mismos dibujos de la barra de abajo de la app (Navegacion.tsx), más chicos. */
function Icono({ nombre }: { nombre: IconoBarra | 'mas' }) {
  const cls = 'h-[17px] w-[17px]';
  switch (nombre) {
    case 'panel':
      return <svg viewBox="0 0 24 24" className={cls} {...trazo}><path d="M3 12l9-8 9 8" /><path d="M5 10.5V20h14v-9.5" /><path d="M9.5 20v-5h5v5" /></svg>;
    case 'vender':
      return <svg viewBox="0 0 24 24" className={cls} {...trazo}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v9M14.8 9.6c-.5-.8-1.5-1.3-2.8-1.3-1.6 0-2.7.8-2.7 2 0 2.8 5.6 1.4 5.6 4.2 0 1.2-1.2 2-2.9 2-1.4 0-2.4-.5-2.9-1.4" /></svg>;
    case 'gastos':
      return <svg viewBox="0 0 24 24" className={cls} {...trazo}><path d="M3.5 7.5h17v11a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" /><path d="M3.5 7.5 6 4h12l2.5 3.5M9 12h6" /></svg>;
    case 'cierre':
    case 'agenda':
      return <svg viewBox="0 0 24 24" className={cls} {...trazo}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 1.8" /></svg>;
    case 'clientes':
      return <svg viewBox="0 0 24 24" className={cls} {...trazo}><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8" /><circle cx="16.8" cy="9.5" r="2.4" /><path d="M16.6 14.4c2 .2 3.4 1.7 3.9 4.1" /></svg>;
    case 'rutinas':
      return <svg viewBox="0 0 24 24" className={cls} {...trazo}><path d="M6.5 7.5v9" /><path d="M17.5 7.5v9" /><path d="M3.5 10v4" /><path d="M20.5 10v4" /><path d="M6.5 12h11" /></svg>;
    case 'lotes':
      return <svg viewBox="0 0 24 24" className={cls} {...trazo}><path d="m12 3 8 4.5-8 4.5-8-4.5z" /><path d="m4 12 8 4.5 8-4.5" /><path d="m4 16.5 8 4.5 8-4.5" /></svg>;
    case 'deudas':
      return <svg viewBox="0 0 24 24" className={cls} {...trazo}><path d="M3.5 7.5h17v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" /><circle cx="12" cy="12" r="2.4" /><path d="M6.5 12h.01M17.5 12h.01" /></svg>;
    case 'organizacion':
      return <svg viewBox="0 0 24 24" className={cls} {...trazo}><path d="M4 6.5h16v13H4z" /><path d="M4 10.5h16" /><path d="M9 10.5v9" /><path d="M8 3.5v3M16 3.5v3" /></svg>;
    default:
      return <svg viewBox="0 0 24 24" className={cls} {...trazo}><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></svg>;
  }
}

/**
 * Cada bloque de la pantalla entra con un fundido y un leve desplazamiento,
 * uno detrás de otro (`paso`). Es la animación `aparecer` de globals.css; con
 * «reducir movimiento» no hay ninguna (`motion-safe:`) y el bloque está
 * quieto desde el principio.
 */
export function Entra({ paso = 0, className = '', children }: { paso?: number; className?: string; children: React.ReactNode }) {
  return (
    <div
      className={`motion-safe:animate-[aparecer_.45s_cubic-bezier(.2,.7,.2,1)_both] ${className}`}
      style={{ animationDelay: `${60 + paso * 70}ms` }}
    >
      {children}
    </div>
  );
}

/** El ícono de verificado que se repite en las pantallas. */
export function Tilde({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2.6}
         strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

export function Celular({
  resumen, negocio, derecha, barra, activa = 0, mas, captura = true, encima, children,
}: {
  /** Una tarjeta que flota encima del teléfono, fuera de la pantalla. */
  encima?: React.ReactNode;
  /** Lo que lee un lector de pantalla en lugar de todo lo de adentro. */
  resumen: string;
  /** El nombre en la cabecera de la app. Sin él, no hay cabecera (la rutina del cliente no es la app). */
  negocio?: string;
  derecha?: string;
  /** La barra de abajo del rubro, sin «Más» (se suma sola). Sin ella, no hay barra. */
  barra?: ItemBarra[];
  /** Qué botón de la barra está encendido; -1 es «Más» (la pantalla no está en la barra). */
  activa?: number;
  mas?: string;
  /** El botón verde del micrófono, el de toda la app. */
  captura?: boolean;
  children: React.ReactNode;
}) {
  const columnas = (barra?.length ?? 0) + 1;
  return (
    <div className="relative mx-auto w-full max-w-[292px]">
      {/* El resplandor verde de la marca, detrás del teléfono. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-4 -inset-y-8"
        style={{ background: 'radial-gradient(closest-side, rgb(var(--verde) / .26), rgb(var(--verde) / 0))' }}
      />

      <div
        role="img"
        aria-label={resumen}
        className="relative rounded-[2.7rem] border border-tinta/15 bg-noche-hondo p-[8px]
                   shadow-[0_28px_50px_-26px_rgba(10,23,18,.55)]"
      >
        {/* Los botones del costado: dan la silueta de un teléfono sin dibujarlo entero. */}
        <span aria-hidden className="absolute -left-[3px] top-[104px] h-7 w-[3px] rounded-l-sm bg-noche-hondo" />
        <span aria-hidden className="absolute -left-[3px] top-[146px] h-12 w-[3px] rounded-l-sm bg-noche-hondo" />
        <span aria-hidden className="absolute -right-[3px] top-[128px] h-16 w-[3px] rounded-r-sm bg-noche-hondo" />

        <div className="relative h-[560px] overflow-hidden rounded-[2.2rem] bg-arena text-tinta">
          {/* ---- barra de estado ---- */}
          <div className="flex h-9 items-center justify-between px-6 pt-1.5 text-[11.5px] font-semibold">
            <span className="tabular-nums">9:41</span>
            <span className="flex items-center gap-1 text-tinta/85">
              <svg viewBox="0 0 18 12" className="h-[9px] w-[14px]" fill="currentColor" aria-hidden>
                <rect x="0" y="8" width="3" height="4" rx=".8" /><rect x="5" y="5.5" width="3" height="6.5" rx=".8" />
                <rect x="10" y="3" width="3" height="9" rx=".8" /><rect x="15" y="0" width="3" height="12" rx=".8" />
              </svg>
              <svg viewBox="0 0 16 12" className="h-[9px] w-[13px]" fill="none" stroke="currentColor" strokeWidth={1.8}
                   strokeLinecap="round" aria-hidden>
                <path d="M1.5 4.2a9.5 9.5 0 0 1 13 0M4 7a5.8 5.8 0 0 1 8 0" /><circle cx="8" cy="10" r=".9" fill="currentColor" />
              </svg>
              <svg viewBox="0 0 26 12" className="h-[10px] w-[22px]" aria-hidden>
                <rect x=".5" y=".5" width="22" height="11" rx="3" fill="none" stroke="currentColor" strokeOpacity=".45" />
                <rect x="2.5" y="2.5" width="15" height="7" rx="1.6" fill="currentColor" />
                <rect x="23.5" y="4" width="1.6" height="4" rx=".8" fill="currentColor" fillOpacity=".45" />
              </svg>
            </span>
          </div>
          {/* La isla de arriba. */}
          <span aria-hidden className="absolute left-1/2 top-[8px] h-[22px] w-[78px] -translate-x-1/2 rounded-full bg-noche-hondo" />

          {/* ---- cabecera de la app ---- */}
          {negocio && (
            <div className="flex items-center justify-between gap-2 px-4 pb-2.5 pt-1">
              <span className="flex min-w-0 items-center gap-2">
                <Marca clase="h-6 w-6 shrink-0" />
                <span className="truncate text-[13px] font-bold tracking-tight">{negocio}</span>
              </span>
              {derecha && <span className="shrink-0 text-[11px] font-semibold text-tinta/60">{derecha}</span>}
            </div>
          )}

          {/* ---- el contenido del rubro ---- */}
          <div className="space-y-2.5 px-3 pb-28">{children}</div>

          {/* El contenido que sigue pasa por detrás de la barra, desvanecido. */}
          {barra && (
            <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-arena via-arena/70 to-arena/0" />
          )}

          {/* ---- el botón verde de la captura ---- */}
          {barra && captura && (
            <span className="absolute bottom-[76px] right-3.5 grid h-11 w-11 place-items-center rounded-full bg-verde text-sobre-verde
                             shadow-[0_10px_24px_-6px_rgba(40,180,100,.7)]">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}
                   strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z" />
                <path d="M18.5 11.5A6.5 6.5 0 0 1 5.5 11.5M12 18v3" />
              </svg>
            </span>
          )}

          {/* ---- la barra de vidrio, la de la app ---- */}
          {barra && (
            <div
              className="barra-vidrio absolute inset-x-2.5 bottom-3.5 grid rounded-full px-1 py-1"
              style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}
            >
              {[...barra.map((b) => ({ icono: b.icono as IconoBarra | 'mas', texto: b.texto })), { icono: 'mas' as const, texto: mas ?? '' }]
                .map((item, i) => {
                  const encendido = activa === -1 ? i === columnas - 1 : i === activa;
                  return (
                    <span
                      key={`${item.icono}-${i}`}
                      className={`flex min-w-0 flex-col items-center gap-0.5 rounded-full px-0.5 py-1.5 text-[9px] font-semibold leading-none ${
                        encendido ? 'bg-verde/15 text-verde-fuerte' : 'text-tinta/60'}`}
                    >
                      <Icono nombre={item.icono} />
                      <span className="max-w-full truncate">{item.texto}</span>
                    </span>
                  );
                })}
            </div>
          )}

          {/* La rayita de abajo del iPhone. */}
          <span aria-hidden className="absolute bottom-1 left-1/2 h-[4px] w-24 -translate-x-1/2 rounded-full bg-tinta/70" />
        </div>
      </div>

      {/* Algo que flota sobre el teléfono y no es de esa pantalla (la ficha del trainer). */}
      {encima}
    </div>
  );
}
