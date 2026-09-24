'use client';

import { useEffect, useMemo, useState } from 'react';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { decimalesDe, dinero, fechaLegible } from '@/lib/formato';
import { hoyISO } from '@/lib/fechas';
import { useLocale, useTextos } from '@/i18n/cliente';
import { CampoMonto } from '@/components/CampoMonto';
import { SelectorCliente, asegurarCliente, type ClienteElegido } from '@/components/SelectorCliente';
import { FormaDeCobro, cuentaDelCobro, useCuentasParaElegir } from '@/components/FormaDeCobro';
import type { TurnoRespuesta } from '@/lib/turno-voz';

/** Lunes primero, como se piensa una semana de clases. 0 es domingo (PostgreSQL). */
const SEMANA = [1, 2, 3, 4, 5, 6, 0] as const;
/** El último precio por hora que usó este profe, para no tipearlo cada vez. */
const CLAVE_PRECIO = 'orden.precioHora';

interface Previa {
  clases: number;
  horas: number;
  total: number;
  choques: { fecha: string; hora: string; alumno: string }[];
}

/** Quién tiene ya un teléfono: lo que devuelve `buscar_clientes`. */
interface Ficha { id: string; nombre: string; telefono: string }

/**
 * «Ana Ruiz» y «ana  ruíz» son el mismo nombre: sin mayúsculas, tildes ni
 * espacios de más, como lo compara la base (`clave_ejercicio`, 098/099).
 */
function mismoNombre(a: string, b: string): boolean {
  const clave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  return clave(a) === clave(b);
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
  empresaId, moneda, zona, clienteId, dictado = null, pedirSalud = false, alCancelar, alListo,
}: {
  empresaId: string;
  moneda: string;
  zona: string;
  /** Desde la ficha el alumno ya está elegido; desde la agenda se elige acá. */
  clienteId?: string;
  /** Lo dictado en el micrófono (092): el alumno, la hora y el día, ya puestos. */
  dictado?: TurnoRespuesta | null;
  /**
   * Preguntar por la salud de alguien nuevo (097). Un trainer tiene que
   * saber de una rodilla operada ANTES de la primera sesión, y el momento
   * de preguntarlo es cuando lo agenda. A un cliente que ya existe no se le
   * pregunta acá: lo suyo está en su ficha.
   */
  pedirSalud?: boolean;
  alCancelar: () => void;
  /**
   * `nuevo` llega solo con alguien que se cargó recién acá, y solo cuando se
   * pregunta por su salud (el trainer): con eso la agenda le ofrece
   * «Siguiente: medidas de inicio · armar su rutina» (098).
   */
  alListo: (mensaje: string, nuevo?: { id: string; nombre: string }) => void;
}) {
  const t = useTextos();
  const i = t.inscribir;
  const locale = useLocale();

  const [alumno, setAlumno] = useState<ClienteElegido>(dictado?.cliente
    ? { id: dictado.cliente.id, nombre: dictado.cliente.nombre, telefono: dictado.cliente.telefono }
    : { id: null, nombre: dictado?.cliente_nombre ?? '', telefono: dictado?.cliente_telefono ?? '' });
  // Lo dictado trae un día: ese día de la semana queda marcado, y el
  // período arranca ahí. La hora dictada dura una hora; el resto se corrige a mano.
  const hoy = hoyISO(zona);
  const diaDictado = dictado?.fecha && /^\d{4}-\d{2}-\d{2}$/.test(dictado.fecha) ? dictado.fecha : null;
  const horaDictada = dictado?.hora && /^\d{2}:\d{2}$/.test(dictado.hora) ? dictado.hora : null;
  const [dias, setDias] = useState<number[]>(
    diaDictado ? [new Date(`${diaDictado}T12:00:00Z`).getUTCDay()] : []);
  const [horaDesde, setHoraDesde] = useState(horaDictada ?? '18:00');
  const [horaHasta, setHoraHasta] = useState(horaDictada
    ? `${String((Number(horaDictada.slice(0, 2)) + 1) % 24).padStart(2, '0')}${horaDictada.slice(2)}` : '19:00');
  const [desde, setDesde] = useState(diaDictado ?? hoy);
  const [hasta, setHasta] = useState(finDePeriodo(diaDictado ?? hoy, 1));
  // Qué se le enseña (094). Texto libre, con las que ya usó como sugerencia.
  const [materia, setMateria] = useState('');
  const [salud, setSalud] = useState('');
  const [sugeridas, setSugeridas] = useState<string[]>([]);
  const [modo, setModo] = useState<'hora' | 'cerrado'>('hora');
  const [precioHora, setPrecioHora] = useState(() => {
    try { return Number(localStorage.getItem(CLAVE_PRECIO)) || 0; } catch { return 0; }
  });
  const [total, setTotal] = useState(0);
  const [pagado, setPagado] = useState<boolean | null>(null);
  const [metodo, setMetodo] = useState<string>('transferencia');
  // En qué cuenta entró, si tiene más de una donde pueda caer (095).
  const cuentas = useCuentasParaElegir(empresaId);
  const [cuenta, setCuenta] = useState<string | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  // La clase en grupo (108): con quién coincide ya se ve en la vista previa;
  // si el profe dice que van juntos, el choque deja de frenar.
  const [enGrupo, setEnGrupo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  // Alguien que ya tiene ese teléfono con otro nombre: «¿es la misma persona?».
  const [mismaPersona, setMismaPersona] = useState<Ficha | null>(null);

  const nombreDia = useMemo(() => {
    // 4 de octubre de 2026 es domingo: de ahí se sacan los nombres cortos.
    const f = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
    return (d: number) => f.format(new Date(Date.UTC(2026, 9, 4 + d))).replace('.', '');
  }, [locale]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { data } = await clienteNavegador().rpc('materias_usadas', { p_empresa: empresaId });
        if (vivo && Array.isArray(data)) setSugeridas(data as string[]);
      } catch { /* sin sugerencias se escribe igual */ }
    })();
    return () => { vivo = false; };
  }, [empresaId]);

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
  const juntos = enGrupo && choques.length > 0;
  const puede = tieneAlumno && dias.length > 0 && (previa?.clases ?? 0) > 0
    && (choques.length === 0 || juntos) && hayPrecio && pagado !== null && !ocupado && !mismaPersona;

  // «Octubre · lun, mar y jue 18:00»: cómo se lee la inscripción en la ficha.
  function nombreDeInscripcion(): string {
    const mes = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' })
      .format(new Date(`${desde}T12:00:00Z`));
    const lista = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' })
      .format(SEMANA.filter((d) => dias.includes(d)).map(nombreDia));
    return `${mes.charAt(0).toUpperCase()}${mes.slice(1)} · ${lista} ${horaDesde}`;
  }

  /**
   * Antes de crear a alguien nuevo con teléfono (el trainer): ¿ese teléfono
   * ya es de otra ficha? `guardar_cliente` toma un teléfono repetido como la
   * misma persona y le cambia el nombre a la ficha que ya estaba: «Tomás»
   * heredaría la hernia, las medidas, la rutina y el consentimiento de Ana,
   * y Ana desaparecería de la lista. Se busca por los dígitos del número
   * (`buscar_clientes` mira `telefono_norm`) y se toma solo la ficha con el
   * mismo número entero. Se pide el tope de la función (50) y no un puñado:
   * la búsqueda es por «contiene» y ordena por nombre, así que con seis, en
   * un negocio con muchos números parecidos, la ficha con el número entero
   * podía quedar afuera de la respuesta y no había pregunta. Con otro
   * nombre se pregunta; con el mismo nombre es la misma persona y no es
   * «nueva». Una ficha archivada no aparece acá ni frena: si tiene datos de
   * entrenamiento y otro nombre, la base (099) le saca el número y la
   * persona nueva nace con su propia ficha; si el error de la base llega
   * igual (una ficha activa que la búsqueda no trajo), se muestra.
   */
  async function quienTieneElTelefono(el: ClienteElegido): Promise<Ficha | null> {
    const digitos = el.telefono.replace(/\D/g, '');
    if (digitos.length < 6) return null;
    const { data, error: e } = await clienteNavegador().rpc('buscar_clientes', {
      p_empresa: empresaId, p_texto: digitos, p_limite: 50,
    });
    if (e) throw e;
    const fichas = Array.isArray(data) ? (data as Ficha[]) : [];
    return fichas.find((x) => (x.telefono ?? '').replace(/\D/g, '') === digitos) ?? null;
  }

  const inscribir = () => inscribirCon(alumno);

  async function inscribirCon(el: ClienteElegido) {
    setOcupado(true);
    setError('');
    setMismaPersona(null);
    try {
      let existia = false;
      if (pedirSalud && !clienteId && !el.id) {
        const otro = await quienTieneElTelefono(el);
        if (otro && !mismoNombre(otro.nombre, el.nombre)) {
          setMismaPersona(otro);
          setOcupado(false);
          return;
        }
        existia = !!otro;
      }
      const cliente = clienteId ?? await asegurarCliente(empresaId, el, pedirSalud ? salud : '');
      if (!cliente) throw new Error(i.faltaAlumno);
      const { error: e } = await clienteNavegador().rpc('inscribir_alumno', {
        p_empresa: empresaId, p_cliente: cliente, p_dias: dias,
        p_hora_desde: horaDesde, p_hora_hasta: horaHasta, p_desde: desde, p_hasta: hasta,
        p_precio_hora: modo === 'hora' ? precioHora : null,
        p_total: modo === 'cerrado' ? total : null,
        p_pagado: pagado === true, p_metodo: metodo, p_nombre: nombreDeInscripcion(),
        p_materia: materia.trim() || null,
        p_cuenta: pagado === true ? cuentaDelCobro(cuentas, metodo, cuenta) : null,
        p_en_grupo: juntos,
      });
      if (e) throw e;
      try { if (modo === 'hora' && precioHora > 0) localStorage.setItem(CLAVE_PRECIO, String(precioHora)); } catch { /* sin almacenamiento, se vuelve a escribir */ }
      // Alguien nuevo (no elegido de la lista ni desde su ficha, y sin una
      // ficha con su teléfono): se devuelve su id, que recién existe, para
      // seguir con él sin buscarlo.
      const esNuevo = pedirSalud && !clienteId && !el.id && !existia;
      alListo(i.listo(previa?.clases ?? 0), esNuevo ? { id: cliente, nombre: el.nombre.trim() } : undefined);
    } catch (e) {
      setError(mensajeDeError(e, t.errores.generico));
      setOcupado(false);
    }
  }

  const plata = (n: number) => dinero(n, moneda, true, locale);

  return (
    <div className="space-y-4 rounded-2xl border border-verde/30 bg-superficie p-4">
      <p className="text-[16px] font-bold tracking-tight">{i.titulo}</p>
      {dictado && (
        <div className="rounded-xl bg-arena px-3 py-2 text-[12.5px] text-tinta/60">
          {dictado.transcripcion && <p className="italic">«{dictado.transcripcion}»</p>}
          <p className="mt-0.5 font-medium">{t.agenda.dictadoInscribir}</p>
        </div>
      )}

      {!clienteId && (
        <SelectorCliente
          empresaId={empresaId} valor={alumno} alElegir={(c) => { setAlumno(c); setMismaPersona(null); }}
          etiqueta={i.alumno} placeholder={i.alumnoEjemplo} pedirTelefono obligatorio
          ayudaTelefono={i.telefonoAyuda}
        />
      )}

      {/* Solo para alguien nuevo: el que ya existe tiene lo suyo en su ficha. */}
      {pedirSalud && !clienteId && !alumno.id && (
        <label className="block">
          <span className="etiqueta">{i.salud} <span className="font-normal text-tinta/40">{t.clientes.opcional}</span></span>
          <textarea className="campo mt-1 min-h-[64px] resize-y" maxLength={1000} rows={2} placeholder={i.saludEjemplo}
            value={salud} onChange={(e) => setSalud(e.target.value)} />
        </label>
      )}

      {/* Qué se le enseña: lo que el profe tiene que saber al mirar la agenda. */}
      <label className="block">
        <span className="etiqueta">{i.materia}</span>
        <input className="campo mt-1" maxLength={60} list="materias-usadas" placeholder={i.materiaEjemplo}
          value={materia} onChange={(e) => setMateria(e.target.value)} />
        <datalist id="materias-usadas">
          {sugeridas.map((m) => <option key={m} value={m} />)}
        </datalist>
      </label>

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
            <div className={`mt-2 rounded-lg px-3 py-2 ${juntos ? 'bg-verde-claro' : 'bg-ambar-claro'}`}>
              {choques.slice(0, 3).map((c) => (
                <p key={`${c.fecha}${c.hora}${c.alumno}`}
                  className={`text-[12.5px] font-semibold ${juntos ? 'text-verde-fuerte' : 'text-ambar'}`}>
                  {juntos
                    ? `✓ ${i.vaCon(fechaLegible(c.fecha, false, locale), c.hora, c.alumno)}`
                    : `⚠ ${i.choca(fechaLegible(c.fecha, false, locale), c.hora, c.alumno)}`}
                </p>
              ))}
              {choques.length > 3 && (
                <p className={`text-[12px] ${juntos ? 'text-verde-fuerte' : 'text-ambar'}`}>
                  {juntos ? i.yMasJuntos(choques.length - 3) : i.yMas(choques.length - 3)}
                </p>
              )}
              {/* Tenis, natación, baile: varios a la misma hora (108). Sin
                  este toque, el horario ocupado sigue frenando, que es lo que
                  le sirve a un profe particular. */}
              <button type="button" aria-pressed={enGrupo} onClick={() => setEnGrupo(!enGrupo)}
                className={`mt-2 ${enGrupo ? 'chip-encendido' : 'chip-apagado'}`}>
                {enGrupo ? '✓ ' : ''}{i.enGrupo}
              </button>
              {juntos && <p className="mt-1.5 text-[12px] text-tinta/60">{i.enGrupoDetalle}</p>}
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
          <div className="mt-2">
            <FormaDeCobro
              cuentas={cuentas} metodo={metodo} elegida={cuenta}
              // Otra forma de pago, otra cuenta: la tocada antes puede no servir.
              alElegirMetodo={(m) => { setMetodo(m); setCuenta(null); }}
              alElegirCuenta={setCuenta}
            />
          </div>
        )}
        {pagado === false && <p className="mt-1.5 text-[12px] leading-snug text-tinta/50">{i.quedaPorCobrar}</p>}
      </div>

      {/* Ese teléfono ya es de otra ficha: se decide acá, antes de crear a nadie. */}
      {mismaPersona && (
        <div role="alert" className="space-y-2.5 rounded-xl bg-ambar-claro px-3.5 py-3 aparecer">
          <p className="text-[13.5px] font-bold text-tinta">{i.mismoTelefono(mismaPersona.nombre)}</p>
          <p className="text-[12.5px] leading-snug text-tinta/65">{i.mismoTelefonoDetalle}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button" className="boton-principal min-h-[44px]" disabled={ocupado}
              onClick={() => {
                // Es esa persona: se usa su ficha, y no es «nueva».
                const el = { id: mismaPersona.id, nombre: mismaPersona.nombre, telefono: mismaPersona.telefono };
                setAlumno(el);
                void inscribirCon(el);
              }}
            >
              {i.siEs(mismaPersona.nombre)}
            </button>
            <button
              type="button" className="boton-suave min-h-[44px]" disabled={ocupado}
              onClick={() => {
                // Es otra persona: sin teléfono, para que la base no las junte.
                const el = { ...alumno, telefono: '' };
                setAlumno(el);
                void inscribirCon(el);
              }}
            >
              {i.noSacarTelefono}
            </button>
          </div>
        </div>
      )}

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
