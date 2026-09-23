'use client';

import { useMemo, useState } from 'react';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { useLocale, useTextos } from '@/i18n/cliente';
import { MEDIDAS, METODOS_GRASA, seAlejaMucho, ultimoValor, validarMedida } from '@/lib/medidas';
import type {
  ClaveMedida, Medicion, MetodoGrasa, RespuestaAnotarMedicion,
} from '@/lib/tipos-rutinas';
import { Confirmar, Hoja, MensajeError } from './panel/Piezas';
import { useAccion } from './panel/useAccion';
import { cifra, fechaCorta, primerNombre } from './panel/utiles';

/** El tope de `mediciones.nota`. */
const LARGO_NOTA = 300;

type Valores = Record<ClaveMedida, string>;
type Errores = Partial<Record<ClaveMedida | 'fecha' | 'metodo' | 'consentimiento', string>>;

/** Lo que se escribe en un campo de medida: números, y la coma o el punto. */
function soloNumero(texto: string): string {
  return texto.replace(/[^\d.,]/g, '').slice(0, 6);
}

/**
 * ANOTAR UN CONTROL (098): el peso y las medidas de un día. También sirve
 * para corregir uno ya anotado (con `control`) o borrarlo.
 *
 * Pensado para el celular, con el cliente parado adelante:
 * - Campos con teclado numérico y coma o punto, como se escriba. La unidad
 *   va adentro del campo, y abajo «la última: 78,4» para tener a mano con
 *   qué comparar.
 * - Las 8 de siempre a la vista; pantorrilla y cuello en «Más medidas».
 * - El % de grasa con su método: una balanza y un plicómetro no se comparan.
 * - Antes de mandar se valida con los mismos rangos que la base
 *   (validarMedida), y si algo se aleja mucho del control anterior
 *   («8,5» en vez de «85») se pregunta «¿Seguro?». No frena: pregunta.
 * - El consentimiento se pide UNA vez, la primera, y dice que puede darlo
 *   la madre, el padre o el tutor de un menor.
 * - Si ya hay un control en esa fecha, se avisa ANTES de guardar, con lo
 *   que cambia («Peso: 78 kg → 80 kg»), y se elige: completarlo, o abrir
 *   ese control para corregirlo. Así nadie pisa sin querer el peso de la
 *   mañana con el de la tarde: antes el aviso llegaba cuando la base ya lo
 *   había pisado. Debajo de cada campo se ve el valor de ese día.
 * - El resumen de después de la base («se completó · esto cambió») queda
 *   de respaldo, para cuando dos personas anotan el mismo día a la vez.
 */
export function AnotarControl({
  empresaId, clienteId, nombre, hoy, mediciones, consintio, control, onCerrar, onListo, onCorregir,
}: {
  empresaId: string;
  clienteId: string;
  nombre: string;
  hoy: string;
  mediciones: Medicion[];
  /** Si ya dijo que sí (consiente_medidas_at). */
  consintio: boolean;
  /** El control que se corrige; null para uno nuevo. */
  control: Medicion | null;
  onCerrar: () => void;
  onListo: (mensaje: string) => void;
  /** Abrir para corregir el control que ya hay en esa fecha, en vez de completarlo. */
  onCorregir?: (m: Medicion) => void;
}) {
  const t = useTextos();
  const a = t.rutinasPanel.anotar;
  const nombres = t.rutinasComun.medidas;
  const locale = useLocale();
  const { ocupado, error, setError, correr } = useAccion();
  const pila = primerNombre(nombre) || nombre;

  // Los otros controles: el que se corrige no se compara contra sí mismo.
  const otras = useMemo(() => mediciones.filter((m) => m.id !== control?.id), [mediciones, control]);

  const [fecha, setFecha] = useState(control?.fecha ?? hoy);
  const [valores, setValores] = useState<Valores>(() => {
    const v = {} as Valores;
    for (const def of MEDIDAS) {
      const n = control?.[def.clave];
      v[def.clave] = n === null || n === undefined ? '' : cifra(Number(n), locale, def.decimales);
    }
    return v;
  });
  // El método de la vez anterior: casi siempre se mide con lo mismo, y así
  // los controles se pueden comparar.
  const [metodo, setMetodo] = useState<MetodoGrasa | null>(() => control?.grasa_metodo
    ?? [...otras].reverse().find((m) => m.grasa_metodo)?.grasa_metodo ?? null);
  const [nota, setNota] = useState(control?.nota ?? '');
  const [mas, setMas] = useState(() => MEDIDAS.some((d) => !d.porDefecto
    && (control?.[d.clave] != null || mediciones.some((m) => m[d.clave] != null))));
  const [consiente, setConsiente] = useState(false);
  const [errores, setErrores] = useState<Errores>({});
  const [seguro, setSeguro] = useState<{ lineas: string[]; datos: Partial<Record<ClaveMedida, number | null>> } | null>(null);
  // Esa fecha ya tiene un control: antes de mandar, qué cambia de lo que tenía.
  const [completar, setCompletar] = useState<{ lineas: string[]; datos: Partial<Record<ClaveMedida, number | null>> } | null>(null);
  const [fusion, setFusion] = useState<RespuestaAnotarMedicion['cambios'] | null>(null);
  const [borrando, setBorrando] = useState(false);

  const conUnidad = (clave: ClaveMedida, n: number) => {
    const def = MEDIDAS.find((d) => d.clave === clave);
    return `${cifra(n, locale, def?.decimales ?? 1)} ${nombres[clave].unidad}`;
  };

  function cambiar(clave: ClaveMedida, texto: string) {
    setValores((v) => ({ ...v, [clave]: soloNumero(texto) }));
    setErrores((e) => ({ ...e, [clave]: undefined }));
    setError('');
  }

  /** Revisa todo antes de mandar. Devuelve los números listos, o null si hay algo mal. */
  function validar(): Partial<Record<ClaveMedida, number | null>> | null {
    const errs: Errores = {};
    const datos: Partial<Record<ClaveMedida, number | null>> = {};

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha < '2000-01-01') errs.fecha = a.fechaMala;
    else if (fecha > hoy) errs.fecha = a.fechaFutura;

    for (const def of MEDIDAS) {
      const v = validarMedida(def.clave, valores[def.clave]);
      if (v.ok) datos[def.clave] = v.valor;
      else {
        errs[def.clave] = v.motivo === 'no_es_numero'
          ? a.noEsNumero
          : a.fueraDeRango(cifra(v.minimo, locale), cifra(v.maximo, locale), nombres[def.clave].unidad);
        // Un error en «Más medidas» no puede quedar escondido.
        if (!def.porDefecto) setMas(true);
      }
    }

    if (datos.grasa_pct != null && !metodo) errs.metodo = a.faltaMetodo;
    if (!consintio && !consiente) errs.consentimiento = a.faltaConsentimiento;

    setErrores(errs);
    if (Object.values(errs).some(Boolean)) { setError(a.revisaLosCampos); return null; }
    if (!Object.values(datos).some((n) => n !== null && n !== undefined)) { setError(a.alMenosUna); return null; }
    return datos;
  }

  // El control que ya hay en la fecha elegida (solo al anotar uno nuevo:
  // al corregir, la base frena si la fecha nueva choca con otro).
  const mismoDia = control ? null : mediciones.find((m) => m.fecha === fecha) ?? null;

  /** Lo que el control de ese día ya tenía y cambia con lo escrito: «Peso: 78 kg → 80 kg». */
  function loQueCambia(m: Medicion, datos: Partial<Record<ClaveMedida, number | null>>): string[] {
    const lineas: string[] = [];
    for (const def of MEDIDAS) {
      const nuevo = datos[def.clave];
      const viejo = m[def.clave];
      if (nuevo === null || nuevo === undefined || viejo === null || viejo === undefined) continue;
      if (Number(viejo) === nuevo) continue;
      lineas.push(a.cambio(nombres[def.clave].nombre, conUnidad(def.clave, Number(viejo)), conUnidad(def.clave, nuevo)));
    }
    const conGrasa = datos.grasa_pct !== null && datos.grasa_pct !== undefined;
    if (conGrasa && metodo && m.grasa_metodo && m.grasa_metodo !== metodo) {
      lineas.push(a.cambio(a.metodoGrasa, t.rutinasComun.metodosGrasa[m.grasa_metodo], t.rutinasComun.metodosGrasa[metodo]));
    }
    const notaNueva = nota.trim();
    if (notaNueva && m.nota.trim() && m.nota.trim() !== notaNueva) lineas.push(a.cambio(a.nota, m.nota.trim(), notaNueva));
    return lineas;
  }

  function alGuardar() {
    setError('');
    const datos = validar();
    if (!datos) return;

    // Esa fecha ya tiene un control y esto cambia algo de lo que tenía:
    // se pregunta antes de pisar.
    if (mismoDia) {
      const cambia = loQueCambia(mismoDia, datos);
      if (cambia.length) { setCompletar({ lineas: cambia, datos }); return; }
    }
    revisarYGuardar(datos);
  }

  function revisarYGuardar(datos: Partial<Record<ClaveMedida, number | null>>) {
    // ¿Algo se aleja mucho del control anterior? Lo que no se tocó al
    // corregir no se vuelve a preguntar.
    const lineas: string[] = [];
    for (const def of MEDIDAS) {
      const nuevo = datos[def.clave];
      if (nuevo === null || nuevo === undefined) continue;
      if (control && Number(control[def.clave]) === nuevo) continue;
      const antes = ultimoValor(otras, def.clave, fecha);
      if (antes && seAlejaMucho(def.clave, antes.valor, nuevo)) {
        lineas.push(a.seguroLinea(nombres[def.clave].nombre, conUnidad(def.clave, antes.valor), conUnidad(def.clave, nuevo)));
      }
    }
    if (lineas.length) { setSeguro({ lineas, datos }); return; }
    void guardar(datos);
  }

  async function guardar(datos: Partial<Record<ClaveMedida, number | null>>) {
    const conGrasa = datos.grasa_pct !== null && datos.grasa_pct !== undefined;
    const p: Record<string, number | string | null> = {};
    if (control) {
      // Corregir: el control queda como está en el formulario, vacíos incluidos.
      for (const def of MEDIDAS) p[def.clave] = datos[def.clave] ?? null;
      p.grasa_metodo = conGrasa ? metodo : null;
      p.nota = nota.trim();
    } else {
      // Nuevo: solo lo escrito. Si ese día ya había un control, la base lo
      // completa con esto, y lo que no se escribió queda como estaba.
      for (const def of MEDIDAS) {
        const n = datos[def.clave];
        if (n !== null && n !== undefined) p[def.clave] = n;
      }
      if (conGrasa) p.grasa_metodo = metodo;
      if (nota.trim()) p.nota = nota.trim();
    }

    const r = await correr(() => clienteNavegador().rpc('anotar_medicion', {
      p_empresa: empresaId,
      p_cliente: clienteId,
      p_fecha: fecha,
      p_datos: p,
      p_consiente: !consintio && consiente,
      p_id: control?.id ?? null,
    }));
    setSeguro(null);
    if (!r.ok) return;
    const d = r.data as RespuestaAnotarMedicion | null;
    if (d?.fusionada) setFusion(Array.isArray(d.cambios) ? d.cambios : []);
    else onListo(t.rutinasPanel.progreso.guardado);
  }

  async function borrar() {
    if (!control) return;
    const r = await correr(() => clienteNavegador().rpc('borrar_medicion', { p_empresa: empresaId, p_id: control.id }));
    if (r.ok) onListo(t.rutinasPanel.progreso.borrado);
  }

  /** Un valor de la lista de cambios, como se lee. */
  function valorLegible(campo: RespuestaAnotarMedicion['cambios'][number]['campo'], v: string | number | null): string {
    if (v === null || v === undefined || v === '') return a.vacio;
    if (campo === 'grasa_metodo') return t.rutinasComun.metodosGrasa[v as MetodoGrasa] ?? String(v);
    if (campo === 'nota') return String(v);
    const n = Number(v);
    return Number.isFinite(n) ? conUnidad(campo, n) : String(v);
  }

  function nombreCampo(campo: RespuestaAnotarMedicion['cambios'][number]['campo']): string {
    if (campo === 'grasa_metodo') return a.metodoGrasa;
    if (campo === 'nota') return a.nota;
    return nombres[campo].nombre;
  }

  if (borrando && control) {
    return (
      <Confirmar
        titulo={a.borrarPregunta} detalle={a.borrarDetalle(fechaCorta(control.fecha, locale, hoy))}
        si={a.siBorrar} peligro ocupado={ocupado} error={error}
        onSi={borrar} onNo={() => { setBorrando(false); setError(''); }}
      />
    );
  }

  // Ya había un control ese día: se completó. Se muestra qué cambió.
  if (fusion) {
    return (
      <Hoja titulo={a.fusionTitulo} onCerrar={() => onListo(t.rutinasPanel.progreso.guardado)}>
        {fusion.length === 0 ? (
          <p className="text-[14px] leading-relaxed text-tinta/70">{a.fusionSinCambios}</p>
        ) : (
          <>
            <p className="text-[14px] font-semibold text-tinta/75">{a.fusionCambios}</p>
            <ul className="mt-2 space-y-1.5">
              {fusion.map((c) => (
                <li key={c.campo} className="rounded-xl bg-arena px-3.5 py-2.5 text-[14px] tabular-nums">
                  {a.cambio(nombreCampo(c.campo), valorLegible(c.campo, c.antes), valorLegible(c.campo, c.despues))}
                </li>
              ))}
            </ul>
          </>
        )}
        <button type="button" onClick={() => onListo(t.rutinasPanel.progreso.guardado)} className="boton-principal mt-5 min-h-[48px] w-full">
          {t.comun.listo}
        </button>
      </Hoja>
    );
  }

  const campo = (clave: ClaveMedida) => {
    const antes = ultimoValor(otras, clave, fecha);
    // Si esa fecha ya tiene un control, su valor: es el que se pisaría.
    const deEseDia = mismoDia?.[clave];
    const ayuda = deEseDia !== null && deEseDia !== undefined
      ? a.eseDia(cifra(Number(deEseDia), locale))
      : antes ? a.laUltima(cifra(antes.valor, locale)) : '';
    return (
      <CampoMedida
        key={clave} clave={clave} nombre={nombres[clave].nombre} unidad={nombres[clave].unidad}
        valor={valores[clave]} error={errores[clave]} onCambiar={(v) => cambiar(clave, v)}
        ayuda={ayuda}
      />
    );
  };

  const deSiempre = MEDIDAS.filter((d) => d.porDefecto && d.clave !== 'grasa_pct');
  const extras = MEDIDAS.filter((d) => !d.porDefecto);

  return (
    <Hoja titulo={control ? a.tituloEditar : a.titulo} onCerrar={onCerrar} bloqueada={ocupado}>
      {completar && mismoDia ? (
        <div>
          <p className="text-[17px] font-bold leading-snug">{a.yaHayControl(fechaCorta(mismoDia.fecha, locale, hoy))}</p>
          <p className="mt-1 text-[14px] leading-relaxed text-tinta/70">{a.cambiaEsto}</p>
          <ul className="mt-2 space-y-1.5">
            {completar.lineas.map((l) => (
              <li key={l} className="rounded-xl bg-ambar-claro px-3.5 py-2.5 text-[14px] font-semibold tabular-nums">{l}</li>
            ))}
          </ul>
          <MensajeError texto={error} />
          <div className="mt-5 grid gap-2.5">
            <button
              type="button" disabled={ocupado} className="boton-principal min-h-[48px] w-full"
              onClick={() => { const d = completar.datos; setCompletar(null); revisarYGuardar(d); }}
            >
              {ocupado ? t.comun.guardando : a.siCompletar}
            </button>
            {onCorregir && (
              <button type="button" disabled={ocupado} onClick={() => onCorregir(mismoDia)} className="boton-suave min-h-[48px] w-full">
                {a.corregirEse}
              </button>
            )}
            <button type="button" disabled={ocupado} onClick={() => setCompletar(null)} className="boton-texto min-h-[44px] w-full">
              {a.revisar}
            </button>
          </div>
        </div>
      ) : seguro ? (
        <div>
          <p className="text-[17px] font-bold">{a.seguroTitulo}</p>
          <p className="mt-1 text-[14px] leading-relaxed text-tinta/70">{a.seguroDetalle}</p>
          <ul className="mt-3 space-y-1.5">
            {seguro.lineas.map((l) => (
              <li key={l} className="rounded-xl bg-ambar-claro px-3.5 py-2.5 text-[14px] font-semibold tabular-nums">{l}</li>
            ))}
          </ul>
          <MensajeError texto={error} />
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <button type="button" onClick={() => setSeguro(null)} disabled={ocupado} className="boton-suave min-h-[48px]">{a.revisar}</button>
            <button type="button" onClick={() => guardar(seguro.datos)} disabled={ocupado} className="boton-principal min-h-[48px]">
              {ocupado ? t.comun.guardando : a.siEstaBien}
            </button>
          </div>
        </div>
      ) : (
        <form
          noValidate className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); if (!ocupado) alGuardar(); }}
        >
          <p className="-mt-1 text-[13.5px] font-semibold text-tinta/60">{nombre}</p>

          <label className="block">
            <span className="etiqueta">{a.fecha}</span>
            <input
              type="date" className="campo" value={fecha} min="2000-01-01" max={hoy}
              onChange={(e) => { setFecha(e.target.value); setErrores((x) => ({ ...x, fecha: undefined })); }}
              aria-invalid={!!errores.fecha}
            />
            {errores.fecha && <span role="alert" className="mt-1 block text-[12px] font-medium text-rojo">{errores.fecha}</span>}
          </label>

          <div className="grid grid-cols-2 gap-x-2.5 gap-y-3">
            {deSiempre.map((d) => campo(d.clave))}
          </div>

          {/* El % de grasa, con su método al lado: sin método no se guarda. */}
          <div>
            <div className="grid grid-cols-2 gap-x-2.5">{campo('grasa_pct')}</div>
            <span className="etiqueta mt-2.5">{a.metodo}</span>
            <div className="flex flex-wrap gap-2">
              {METODOS_GRASA.map((m) => (
                <button
                  key={m} type="button" aria-pressed={metodo === m}
                  onClick={() => { setMetodo(metodo === m ? null : m); setErrores((x) => ({ ...x, metodo: undefined })); }}
                  className={metodo === m ? 'chip-encendido' : 'chip-apagado'}
                >
                  {t.rutinasComun.metodosGrasa[m]}
                </button>
              ))}
            </div>
            {errores.metodo && <span role="alert" className="mt-1 block text-[12px] font-medium text-rojo">{errores.metodo}</span>}
          </div>

          <div>
            <button
              type="button" onClick={() => setMas(!mas)} aria-expanded={mas}
              className="boton-texto inline-flex min-h-[44px] items-center text-[14px]"
            >
              {mas ? a.menosMedidas : a.masMedidas}
            </button>
            {mas && (
              <div className="mt-1 grid grid-cols-2 gap-x-2.5 gap-y-3">
                {extras.map((d) => campo(d.clave))}
              </div>
            )}
          </div>

          <label className="block">
            <span className="etiqueta">{a.nota} <span className="font-normal text-tinta/45">{a.opcional}</span></span>
            <textarea
              className="campo min-h-[72px] resize-y" value={nota} maxLength={LARGO_NOTA}
              placeholder={a.notaEjemplo} onChange={(e) => setNota(e.target.value)}
            />
          </label>

          {!consintio && (
            <div>
              <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-2xl border border-borde bg-arena/60 px-3.5 py-3">
                <input
                  type="checkbox" checked={consiente}
                  onChange={(e) => { setConsiente(e.target.checked); setErrores((x) => ({ ...x, consentimiento: undefined })); }}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-verde"
                />
                <span>
                  <span className="block text-[14px] font-semibold leading-snug">{a.consentimiento(pila)}</span>
                  <span className="mt-1 block text-[12px] leading-snug text-tinta/55">{a.consentimientoAyuda}</span>
                </span>
              </label>
              {errores.consentimiento && (
                <span role="alert" className="mt-1 block text-[12px] font-medium text-rojo">{errores.consentimiento}</span>
              )}
            </div>
          )}

          <MensajeError texto={error} />

          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" onClick={onCerrar} disabled={ocupado} className="boton-suave min-h-[48px]">{t.comun.cancelar}</button>
            <button type="submit" disabled={ocupado} className="boton-principal min-h-[48px]">
              {ocupado ? t.comun.guardando : t.comun.guardar}
            </button>
          </div>

          {control && (
            <button
              type="button" onClick={() => { setError(''); setBorrando(true); }} disabled={ocupado}
              className="inline-flex min-h-[44px] w-full items-center justify-center text-[13.5px] font-semibold text-tinta/45 hover:text-rojo"
            >
              {a.borrar}
            </button>
          )}
        </form>
      )}
    </Hoja>
  );
}

function CampoMedida({
  clave, nombre, unidad, valor, error, ayuda, onCambiar,
}: {
  clave: ClaveMedida;
  nombre: string;
  unidad: string;
  valor: string;
  error?: string;
  ayuda: string;
  onCambiar: (texto: string) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="etiqueta truncate">{nombre}</span>
      <span className="relative block">
        <input
          name={clave} className="campo pr-11 tabular-nums" inputMode="decimal" enterKeyHint="next"
          autoComplete="off" value={valor} onChange={(e) => onCambiar(e.target.value)} aria-invalid={!!error}
        />
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-[14px] text-tinta/45">
          {unidad}
        </span>
      </span>
      {error
        ? <span role="alert" className="mt-1 block text-[12px] font-medium leading-snug text-rojo">{error}</span>
        : ayuda && <span className="mt-1 block truncate text-[12px] text-tinta/45">{ayuda}</span>}
    </label>
  );
}
