import Link from 'next/link';

/**
 * La lista de Ajustes y la cabecera de cada sección (ver ajustes/page.tsx).
 * Sin datos ni hooks: la página decide qué secciones hay y cómo se llaman.
 */
export const SECCIONES_AJUSTES = [
  'negocio', 'moneda', 'equipo', 'plan', 'idioma', 'avisos',
  'estado', 'permisos', 'calculos', 'soporte', 'admin', 'peligro',
] as const;
export type SeccionAjustes = (typeof SECCIONES_AJUSTES)[number];

export function MenuAjustes({
  grupos, titulos, detalles,
}: {
  grupos: SeccionAjustes[][];
  titulos: Record<SeccionAjustes, string>;
  detalles: Record<SeccionAjustes, string>;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {grupos.filter((g) => g.length > 0).map((g) => (
        <ul key={g[0]} className="tarjeta overflow-hidden p-2">
          {g.map((clave) => {
            const delicada = clave === 'peligro';
            return (
              <li key={clave}>
                <Link
                  href={`/ajustes?ver=${clave}`}
                  className="flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-arena active:bg-arena"
                >
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                    delicada ? 'bg-rojo-claro text-rojo' : 'bg-verde-claro text-verde-fuerte'
                  }`}>
                    {ICONOS[clave]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[15px] font-semibold ${delicada ? 'text-rojo' : ''}`}>
                      {titulos[clave]}
                    </span>
                    <span className="block truncate text-[12.5px] text-tinta/50">{detalles[clave]}</span>
                  </span>
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-tinta/30" {...trazo} strokeWidth={2}>
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                </Link>
              </li>
            );
          })}
        </ul>
      ))}
    </div>
  );
}

/** Arriba de cada sección: volver a la lista y el nombre grande. */
export function CabeceraAjuste({ titulo, volver }: { titulo: string; volver: string }) {
  return (
    <div>
      <Link href="/ajustes" className="inline-flex items-center gap-1 text-[14px] font-semibold text-verde-fuerte">
        <svg viewBox="0 0 24 24" className="h-4 w-4" {...trazo} strokeWidth={2.2}><path d="m15 6-6 6 6 6" /></svg>
        {volver}
      </Link>
      <h2 className="mt-2 font-titulo text-[28px] font-extrabold leading-tight tracking-tight">{titulo}</h2>
    </div>
  );
}

const trazo = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

const ICONOS: Record<SeccionAjustes, React.ReactNode> = {
  negocio: <svg viewBox="0 0 24 24" className="h-5 w-5" {...trazo}><path d="M4 10.5 5.5 5h13L20 10.5M4 10.5h16M4 10.5V19h16v-8.5M9.5 19v-4.5h5V19" /></svg>,
  moneda: <svg viewBox="0 0 24 24" className="h-5 w-5" {...trazo}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5S9.7 5.9 12 3.5Z" /></svg>,
  equipo: <svg viewBox="0 0 24 24" className="h-5 w-5" {...trazo}><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8M16 5.6a3 3 0 0 1 0 5.8M17.5 14.4c1.7.6 2.8 2.2 3.1 4.6" /></svg>,
  plan: <svg viewBox="0 0 24 24" className="h-5 w-5" {...trazo}><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 14.5h4" /></svg>,
  idioma: <svg viewBox="0 0 24 24" className="h-5 w-5" {...trazo}><path d="M4 5.5h9M8.5 3.5v2M6 5.5c.8 3.6 3.3 6.3 6.5 7.5M11 5.5c-.8 3.8-3.3 6.8-7 8.5M13 20.5l3.8-9 3.7 9M14.3 17.5h5" /></svg>,
  avisos: <svg viewBox="0 0 24 24" className="h-5 w-5" {...trazo}><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15ZM10 20.5a2.2 2.2 0 0 0 4 0" /></svg>,
  estado: <svg viewBox="0 0 24 24" className="h-5 w-5" {...trazo}><path d="M12 3.5 19.5 6v5.5c0 4.4-3.1 7.9-7.5 9-4.4-1.1-7.5-4.6-7.5-9V6Z" /><path d="m8.8 12 2.2 2.2 4.2-4.4" /></svg>,
  permisos: <svg viewBox="0 0 24 24" className="h-5 w-5" {...trazo}><rect x="5" y="10.5" width="14" height="10" rx="2.2" /><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" /></svg>,
  calculos: <svg viewBox="0 0 24 24" className="h-5 w-5" {...trazo}><rect x="5" y="3.5" width="14" height="17" rx="2.5" /><path d="M8.5 7.5h7M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01M8.5 15h.01M12 15h.01M15.5 15v2.5" /></svg>,
  soporte: <svg viewBox="0 0 24 24" className="h-5 w-5" {...trazo}><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12Z" /><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" /></svg>,
  admin: <svg viewBox="0 0 24 24" className="h-5 w-5" {...trazo}><circle cx="12" cy="12" r="7.5" /><path d="M12 8.5v7" /></svg>,
  peligro: <svg viewBox="0 0 24 24" className="h-5 w-5" {...trazo}><path d="M12 4 21 19.5H3Z" /><path d="M12 10v4M12 17h.01" /></svg>,
};
