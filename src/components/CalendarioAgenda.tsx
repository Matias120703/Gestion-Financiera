'use client';

import { useEffect, useMemo, useState } from 'react';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { diffDias, finDeMes, inicioDeSemana, sumarDias } from '@/lib/fechas';
import { useLocale, useTextos } from '@/i18n/cliente';

export type VistaAgenda = 'dia' | 'semana' | 'mes' | 'rango';

export interface DiaCalendario {
  fecha: string;
  turnos: number;
  abierto_min: number;
  ocupado_min: number;
  libre_min: number;
  estado: 'libre' | 'casi' | 'lleno' | 'cerrado';
}

/**
 * LA AGENDA COMO CALENDARIO (072).
 *
 * Del cuaderno de Matías: «añadir calendario para ver la agenda, como una
 * opción para ver: una semana, un mes o el rango que quieran, si tienen
 * disponible o no».
 *
 * Es una forma de MIRAR, no otra agenda: cada día dice cuántos turnos tiene y
 * qué tan lleno está, y tocarlo lleva a la vista de ese día, donde se anota,
 * se mueve y se atiende. Anotar desde el calendario sería tener dos lugares
 * para lo mismo.
 *
 * Los números los calcula la base con la misma regla de horarios que ofrece
 * los huecos (feriados, días especiales, cada profesional): un calendario que
 * diga «libre» un feriado sería peor que no tener calendario.
 */
export function CalendarioAgenda({
  empresaId, vista, dia, hoy, alElegirDia,
}: {
  empresaId: string;
  vista: Exclude<VistaAgenda, 'dia'>;
  /** El día de referencia: la semana o el mes que lo contiene. */
  dia: string;
  hoy: string;
  alElegirDia: (fecha: string) => void;
}) {
  const t = useTextos();
  const a = t.agenda;
  const locale = useLocale();

  // Dónde está parado: se mueve con las flechas sin cambiar el día elegido.
  const [ancla, setAncla] = useState(dia);
  const [rangoDesde, setRangoDesde] = useState(dia);
  const [rangoHasta, setRangoHasta] = useState(sumarDias(dia, 13));
  const [dias, setDias] = useState<DiaCalendario[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { setAncla(dia); }, [dia, vista]);

  // El rango que se pide y el que se dibuja. El mes se completa hasta el
  // lunes anterior y el domingo siguiente: una grilla con huecos al principio
  // hace pensar que esos días no existen.
  const { desde, hasta, titulo } = useMemo(() => {
    if (vista === 'semana') {
      const lunes = inicioDeSemana(ancla);
      const domingo = sumarDias(lunes, 6);
      return { desde: lunes, hasta: domingo, titulo: `${corta(lunes, locale)} – ${corta(domingo, locale)}` };
    }
    if (vista === 'mes') {
      const primero = `${ancla.slice(0, 7)}-01`;
      const ultimo = finDeMes(ancla);
      const nombre = new Date(`${primero}T12:00:00Z`).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
      return {
        desde: inicioDeSemana(primero),
        hasta: sumarDias(inicioDeSemana(ultimo), 6),
        titulo: nombre.charAt(0).toUpperCase() + nombre.slice(1),
      };
    }
    return { desde: rangoDesde, hasta: rangoHasta, titulo: `${corta(rangoDesde, locale)} – ${corta(rangoHasta, locale)}` };
  }, [vista, ancla, rangoDesde, rangoHasta, locale]);

  const rangoValido = diffDias(desde, hasta) >= 0 && diffDias(desde, hasta) <= 92;

  useEffect(() => {
    if (!rangoValido) { setDias([]); setError(a.rangoLargo); return; }
    let vivo = true;
    setDias(null);
    setError('');
    clienteNavegador()
      .rpc('agenda_calendario', { p_empresa: empresaId, p_desde: desde, p_hasta: hasta })
      .then(({ data, error: e }) => {
        if (!vivo) return;
        if (e) { setError(mensajeDeError(e, t.errores.generico)); setDias([]); return; }
        setDias(Array.isArray(data) ? (data as DiaCalendario[]) : []);
      });
    return () => { vivo = false; };
  }, [empresaId, desde, hasta, rangoValido, a.rangoLargo, t.errores.generico]);

  const mover = (paso: number) => {
    if (vista === 'semana') setAncla(sumarDias(ancla, paso * 7));
    if (vista === 'mes') {
      const [anio, mes] = ancla.split('-').map(Number);
      const d = new Date(Date.UTC(anio, mes - 1 + paso, 1));
      setAncla(d.toISOString().slice(0, 10));
    }
  };

  // Lunes a domingo, en el idioma de cada uno: «L M M J V S D» o «S T Q Q S S D».
  const cabecera = useMemo(() => Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(locale, { weekday: 'narrow', timeZone: 'UTC' })), [locale]);

  const mesDeAncla = ancla.slice(0, 7);
  const flecha = 'rounded-lg border border-borde px-2.5 py-1 text-[15px] font-bold leading-none text-tinta/50 transition hover:border-verde/40 hover:text-verde-fuerte';

  const totales = (dias ?? []).reduce((s, d) => ({
    turnos: s.turnos + d.turnos,
    libres: s.libres + (d.estado === 'libre' && d.fecha >= hoy ? 1 : 0),
  }), { turnos: 0, libres: 0 });

  return (
    <div className="px-4 pb-4">
      {vista === 'rango' ? (
        <div className="grid grid-cols-2 gap-2.5">
          <label className="block">
            <span className="etiqueta">{a.desde}</span>
            <input type="date" className="campo mt-1 py-2" value={rangoDesde}
              onChange={(e) => e.target.value && setRangoDesde(e.target.value)} />
          </label>
          <label className="block">
            <span className="etiqueta">{a.hasta}</span>
            <input type="date" className="campo mt-1 py-2" value={rangoHasta} min={rangoDesde}
              onChange={(e) => e.target.value && setRangoHasta(e.target.value)} />
          </label>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <button type="button" className={flecha} aria-label={a.anterior} onClick={() => mover(-1)}>‹</button>
          <p className="text-[15px] font-bold tracking-tight">{titulo}</p>
          <button type="button" className={flecha} aria-label={a.siguiente} onClick={() => mover(1)}>›</button>
        </div>
      )}

      {dias && dias.length > 0 && (
        <p className="mt-2 text-center text-[12.5px] text-tinta/50">
          {a.resumenCalendario(totales.turnos, totales.libres)}
        </p>
      )}

      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {cabecera.map((c, i) => (
          <span key={i} className="pb-1 text-center text-[11px] font-bold uppercase text-tinta/35">{c}</span>
        ))}

        {dias === null
          ? Array.from({ length: vista === 'semana' ? 7 : 35 }, (_, i) => (
            <span key={i} className="aspect-square animate-pulse rounded-xl bg-arena" />
          ))
          : dias.map((d) => {
            const pasado = d.fecha < hoy;
            const fueraDelMes = vista === 'mes' && d.fecha.slice(0, 7) !== mesDeAncla;
            const elegido = d.fecha === dia;
            return (
              <button
                key={d.fecha}
                type="button"
                onClick={() => alElegirDia(d.fecha)}
                aria-label={`${larga(d.fecha, locale)} · ${a.turnosN(d.turnos)} · ${a.estadoCalendario[d.estado]}`}
                className={`relative flex flex-col items-center justify-between rounded-xl border px-0.5 pb-1.5 pt-1 transition active:scale-95 ${
                  vista === 'semana' ? 'min-h-[84px]' : 'aspect-square'
                } ${elegido ? 'border-verde ring-2 ring-verde/30' : 'border-borde'} ${
                  fueraDelMes || pasado ? 'opacity-45' : ''
                } ${COLOR[d.estado]}`}
              >
                <span className={`text-[13px] font-bold tabular-nums ${d.fecha === hoy ? 'rounded-full bg-verde px-1.5 text-sobre-verde' : ''}`}>
                  {Number(d.fecha.slice(8, 10))}
                </span>
                {d.turnos > 0 ? (
                  <span className="text-[10.5px] font-bold leading-none tabular-nums text-tinta/70">
                    {/* Solo el número, también en la semana: «3 horários» no entra en
                        una casilla de 37px y cruzaba el borde. La frase entera va en
                        el aria-label del botón. */}
                    {d.turnos}
                  </span>
                ) : (
                  <span className="text-[10px] leading-none text-tinta/30">{d.estado === 'cerrado' ? '—' : ''}</span>
                )}
                <span className={`h-1 w-5 rounded-full ${BARRA[d.estado]}`} />
              </button>
            );
          })}
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-rojo-claro px-3 py-2 text-[12.5px] font-medium text-rojo">{error}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11.5px] text-tinta/55">
        {(['libre', 'casi', 'lleno', 'cerrado'] as const).map((e) => (
          <span key={e} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${BARRA[e]}`} />
            {a.estadoCalendario[e]}
          </span>
        ))}
      </div>
      <p className="mt-2 text-center text-[12px] text-tinta/40">{a.tocaUnDia}</p>
    </div>
  );
}

const COLOR: Record<DiaCalendario['estado'], string> = {
  libre: 'bg-superficie',
  casi: 'bg-ambar-claro/50',
  lleno: 'bg-rojo-claro/60',
  cerrado: 'bg-arena',
};

const BARRA: Record<DiaCalendario['estado'], string> = {
  libre: 'bg-verde',
  casi: 'bg-ambar',
  lleno: 'bg-rojo',
  cerrado: 'bg-tinta/20',
};

function corta(iso: string, locale: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function larga(iso: string, locale: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** El selector «Día · Semana · Mes · Elegir fechas». */
export function SelectorVista({ vista, alCambiar }: { vista: VistaAgenda; alCambiar: (v: VistaAgenda) => void }) {
  const a = useTextos().agenda;
  const opciones: { valor: VistaAgenda; texto: string }[] = [
    { valor: 'dia', texto: a.vistaDia },
    { valor: 'semana', texto: a.vistaSemana },
    { valor: 'mes', texto: a.vistaMes },
    { valor: 'rango', texto: a.vistaRango },
  ];
  return (
    <div className="mx-4 mb-3 grid grid-cols-4 gap-1 rounded-2xl bg-arena p-1" role="tablist">
      {opciones.map((o) => (
        <button
          key={o.valor} type="button" role="tab" aria-selected={vista === o.valor}
          onClick={() => alCambiar(o.valor)}
          className={`rounded-xl px-1 py-2 text-[12.5px] font-bold transition ${
            vista === o.valor ? 'bg-superficie text-verde-fuerte shadow-tarjeta' : 'text-tinta/50'
          }`}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}
