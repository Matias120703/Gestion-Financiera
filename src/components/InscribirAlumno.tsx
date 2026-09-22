'use client';

import { useEffect, useMemo, useState } from 'react';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { decimalesDe, dinero, fechaLegible } from '@/lib/formato';
import { hoyISO } from '@/lib/fechas';
import { useLocale, useTextos } from '@/i18n/cliente';
import { metodoVisible } from '@/i18n/nombres';
import { CampoMonto } from '@/components/CampoMonto';
import { SelectorCliente, asegurarCliente, type ClienteElegido } from '@/components/SelectorCliente';

/** Lunes primero, como se piensa una semana de clases. 0 es domingo (PostgreSQL). */
const SEMANA = [1, 2, 3, 4, 5, 6, 0] as const;
const METODOS = ['efectivo', 'transferencia', 'tarjeta'] as const;
/** El último precio por hora que usó este profe, para no tipearlo cada vez. */
const CLAVE_PRECIO = 'orden.precioHora';

interface Previa {
  clases: number;
  horas: number;
  total: number;
  choques: { fecha: string; hora: string; alumno: string }[];
}

/** «2026-10-01» + n meses − 1 día: un mes de clases termina el día antes. */
function finDePeriodo(desde: string, meses: number): string {
  const [a, m, d] = desde.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1 + meses, d - 1));
  return f.toISOString().slice(0, 10);
}

/**
 * INSCRIBIR A UN ALUMNO (091).
 *
 * El flujo de un profe, como lo contó Matías: el alumno le escribe por
 * WhatsApp, el profe mira su agenda, se ponen de acuerdo, y anota «lunes,
 * martes y jueves de 6 a 7, cobro 50.000 la hora, por un mes». Orden hace la
 * cuenta y pone las clases en la agenda.
 *
 * LA CUENTA LA HACE LA BASE, MIENTRAS SE ESCRIBE
 *
 * Cuántas clases caen, cuánto da y con quién choca se le pregunta a la base
 * a medida que se completa el formulario, y no se calcula acá. Es la misma
 * función que después decide si se puede inscribir: si la pantalla hiciera
 * su propia cuenta, algún día diría «13 clases» y la base inscribiría 12.
 */
export function InscribirAlumno({
  empresaId, moneda, zona, clienteId, alCancelar, alListo,
}: {
  empresaId: string;
  moneda: string;
  zona: string;
  /** Desde la ficha el alumno ya está elegido; desde la agenda se elige acá. */
  clienteId?: string;
  alCancelar: () => void;
  alListo: (mensaje: string) => void;
}) {
  const t = useTextos();
  const i = t.inscribir;
  const locale = useLocale();

  const [alumno, setAlumno] = useState<ClienteElegido>({ id: null, nombre: '', telefono: '' });
  const [dias, setDias] = useState<number[]>([]);
  const [horaDesde, setHoraDesde] = useState('18:00');
  const [horaHasta, setHoraHasta] = useState('19:00');
  const hoy = hoyISO(zona);
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(finDePeriodo(hoy, 1));
  const [modo, setModo] = useState<'hora' | 'cerrado'>('hora');
  const [precioHora, setPrecioHora] = useState(() => {
    try { return Number(localStorage.getItem(CLAVE_PRECIO)) || 0; } catch { return 0; }
  });
  const [total, setTotal] = useState(0);
  const [pagado, setPagado] = useState<boolean | null>(null);
  const [metodo, setMetodo] = useState<string>('transferencia');
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  const nombreDia = useMemo(() => {
    // 4 de octubre de 2026 es domingo: de ahí se sacan los nombres cortos.
    const f = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
    return (d: number) => f.format(new Date(Date.UTC(2026, 9, 4 + d))).replace('.', '');
  }, [locale]);

  // Mientras se escribe, la base dice cuántas clases, cuánto y con quién choca.
  useEffect(() => {
    let vivo = true;
    const id = setTimeout(async () => {
      try {
        const { data } = await clienteNavegador().rpc('vista_previa_inscripcion', {
          p_empresa: empresaId, p_dias: dias, p_hora_desde: horaDesde, p_hora_hasta: horaHasta,
          p_desde: desde, p_hasta: hasta,
          p_precio_hora: modo === 'hora' ? precioHora : null,
          p_total: modo === 'cerrado' ? total : null,
        });
        if (vivo) setPrevia((data as Previa) ?? null);
      } catch { /* la vista previa es ayuda: si falla, inscribir igual valida */ }
    }, 300);
    return () => { vivo = false; clearTimeout(id); };
  }, [empresaId, dias, horaDesde, horaHasta, desde, hasta, modo, precioHora, total]);

  const choques = previa?.choques ?? [];
  const hayPrecio = modo === 'hora' ? precioHora > 0 : total > 0;
  const tieneAlumno = Boolean(clienteId) || alumno.nombre.trim().length > 0;
  const puede = tieneAlumno && dias.length > 0 && (previa?.clases ?? 0) > 0
    && choques.length === 0 && hayPrecio && pagado !== null && !ocupado;

  // «Octubre · lun, mar y jue 18:00»: cómo se lee la inscripción en la ficha.
  function nombreDeInscripcion(): string {
    const mes = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' })
      .format(new Date(`${desde}T12:00:00Z`));
    const lista = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' })
      .format(SEMANA.filter((d) => dias.includes(d)).map(nombreDia));
    return `${mes.charAt(0).toUpperCase()}${mes.slice(1)} · ${lista} ${horaDesde}`;
  }

  async function inscribir() {
    setOcupado(true);
    setError('');
    try {
      const cliente = clienteId ?? await asegurarCliente(empresaId, alumno);
      if (!cliente) throw new Error(i.faltaAlumno);
      const { error: e } = await clienteNavegador().rpc('inscribir_alumno', {
        p_empresa: empresaId, p_cliente: cliente, p_dias: dias,
        p_hora_desde: horaDesde, p_hora_hasta: horaHasta, p_desde: desde, p_hasta: hasta,
        p_precio_hora: modo === 'hora' ? precioHora : null,
        p_total: modo === 'cerrado' ? total : null,
        p_pagado: pagado === true, p_metodo: metodo, p_nombre: nombreDeInscripcion(),
      });
      if (e) throw e;
      try { if (modo === 'hora' && precioHora > 0) localStorage.setItem(CLAVE_PRECIO, String(precioHora)); } catch { /* sin almacenamiento, se vuelve a escribir */ }
      alListo(i.listo(previa?.clases ?? 0));
    } catch (e) {
      setError(mensajeDeError(e, t.errores.generico));
      setOcupado(false);
    }
  }

  const plata = (n: number) => dinero(n, moneda, true, locale);

  return (
    <div className="space-y-4 rounded-2xl border border-verde/30 bg-superficie p-4">
      <p className="text-[16px] font-bold tracking-tight">{i.titulo}</p>

      {!clienteId && (
        <SelectorCliente
          empresaId={empresaId} valor={alumno} alElegir={setAlumno}
          etiqueta={i.alumno} placeholder={i.alumnoEjemplo} pedirTelefono obligatorio
          ayudaTelefono={i.telefonoAyuda}
        />
      )}

      <div>
        <span className="etiqueta">{i.dias}</span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {SEMANA.map((d) => {
            const on = dias.includes(d);
            return (
              <button key={d} type="button"
                // Sobre la lista actual y no sobre la del render: dos toques
                // seguidos no se pisan entre sí.
                onClick={() => setDias((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))}
                className={`${on ? 'chip-encendido' : 'chip-apagado'} min-w-[3.1rem] justify-center capitalize`}>
                {nombreDia(d)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <label className="block">
          <span className="etiqueta">{i.de}</span>
          <input type="time" className="campo mt-1" value={horaDesde} onChange={(e) => setHoraDesde(e.target.value)} />
        </label>
        <label className="block">
          <span className="etiqueta">{i.a}</span>
          <input type="time" className="campo mt-1" value={horaHasta} onChange={(e) => setHoraHasta(e.target.value)} />
        </label>
      </div>

      <div>
        <span className="etiqueta">{i.periodo}</span>
        <div className="mt-1 grid grid-cols-2 gap-2.5">
          <input type="date" className="campo" value={desde}
            onChange={(e) => { setDesde(e.target.value); if (e.target.value > hasta) setHasta(finDePeriodo(e.target.value, 1)); }} />
          <input type="date" className="campo" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {[1, 2, 3].map((m) => (
            <button key={m} type="button" onClick={() => setHasta(finDePeriodo(desde, m))}
              className={hasta === finDePeriodo(desde, m) ? 'chip-encendido' : 'chip-apagado'}>
              {i.meses(m)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="etiqueta">{i.cobras}</span>
        <div className="mt-1 flex gap-2">
          <button type="button" onClick={() => setModo('hora')} className={modo === 'hora' ? 'chip-encendido' : 'chip-apagado'}>
            {i.porHora}
          </button>
          <button type="button" onClick={() => setModo('cerrado')} className={modo === 'cerrado' ? 'chip-encendido' : 'chip-apagado'}>
            {i.precioCerrado}
          </button>
        </div>
        <div className="mt-2">
          {modo === 'hora'
            ? <CampoMonto key="hora" className="campo" decimales={decimalesDe(moneda)} placeholder={i.laHora}
                valor={precioHora} alCambiar={setPrecioHora} />
            : <CampoMonto key="cerrado" className="campo" decimales={decimalesDe(moneda)} placeholder={i.todoElPeriodo}
                valor={total} alCambiar={setTotal} />}
        </div>
      </div>

      {/* Lo que va a pasar, antes de que pase. */}
      {previa && previa.clases > 0 && (
        <div className="rounded-xl bg-arena px-3.5 py-3">
          <p className="text-[13px] text-tinta/60">{i.resumen(previa.clases, Number(previa.horas).toLocaleString(locale))}</p>
          <p className="mt-0.5 font-titulo text-[24px] font-extrabold tabular-nums tracking-tight">
            {plata(Number(previa.total))}
          </p>
          {choques.length > 0 && (
            <div className="mt-2 rounded-lg bg-ambar-claro px-3 py-2">
              {choques.slice(0, 3).map((c) => (
                <p key={`${c.fecha}${c.hora}`} className="text-[12.5px] font-semibold text-ambar">
                  ⚠ {i.choca(fechaLegible(c.fecha, false, locale), c.hora, c.alumno)}
                </p>
              ))}
              {choques.length > 3 && <p className="text-[12px] text-ambar">{i.yMas(choques.length - 3)}</p>}
            </div>
          )}
        </div>
      )}

      <div>
        <span className="etiqueta">{i.yaPago}</span>
        <div className="mt-1 flex gap-2">
          <button type="button" onClick={() => setPagado(true)} className={pagado === true ? 'chip-encendido' : 'chip-apagado'}>
            {i.siAhora}
          </button>
          <button type="button" onClick={() => setPagado(false)} className={pagado === false ? 'chip-encendido' : 'chip-apagado'}>
            {i.todaviaNo}
          </button>
        </div>
        {pagado === true && (
          <div className="mt-2 flex flex-wrap gap-2">
            {METODOS.map((m) => (
              <button key={m} type="button" onClick={() => setMetodo(m)}
                className={metodo === m ? 'chip-encendido' : 'chip-apagado'}>
                {metodoVisible(t, m)}
              </button>
            ))}
          </div>
        )}
        {pagado === false && <p className="mt-1.5 text-[12px] leading-snug text-tinta/50">{i.quedaPorCobrar}</p>}
      </div>

      {error && <p className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}

      <div className="flex gap-2">
        <button type="button" className="boton-principal flex-1 py-2.5" disabled={!puede} onClick={inscribir}>
          {ocupado ? t.comun.guardando : i.inscribir}
        </button>
        <button type="button" className="boton-suave px-4 py-2.5" onClick={alCancelar} disabled={ocupado}>
          {t.comun.cancelar}
        </button>
      </div>
    </div>
  );
}
