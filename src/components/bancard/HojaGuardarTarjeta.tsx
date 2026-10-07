'use client';

import { useState } from 'react';
import { Hoja, MensajeError, PieHoja } from '@/components/Hoja';
import { useTextos } from '@/i18n/cliente';
import { mensajeDeError } from '@/lib/errores';
import { telefonoInternacional } from '@/lib/telefono';
import { FormularioBancard } from './FormularioBancard';

export interface TarjetaGuardadaVista {
  tarjeta: number;
  marca: string | null;
  ultimos4: string | null;
}

type Paso = 'consentir' | 'abriendo' | 'formulario' | 'verificando' | 'guardada' | 'fallo';

/**
 * «GUARDAR MI TARJETA»: el catastro de Bancard, adentro de Orden.
 *
 *   1. El consentimiento del cobro recurrente, en una casilla que hay que
 *      tildar: el texto exacto aceptado viaja al servidor y queda guardado
 *      con quién y cuándo. Si Bancard exige un teléfono y la cuenta no
 *      tiene, se pide acá mismo.
 *   2. El formulario de catastro de Bancard (`Bancard.Cards`): la persona
 *      carga su tarjeta y su cédula ahí; Orden no ve ni guarda el número.
 *   3. LO QUE DICE EL FORMULARIO NO CUENTA: al terminar (diga «éxito» o
 *      «falló»), el servidor le pide a Bancard la lista de tarjetas y solo si
 *      la tarjeta está, queda guardada («Tarjeta guardada: Visa •••• 0016»).
 */
export function HojaGuardarTarjeta({
  empresaId, entorno, urlScript, origen, zona, anual, onCerrar, onGuardada,
}: {
  empresaId: string;
  entorno: 'staging' | 'produccion';
  urlScript: string;
  origen: string;
  zona: string;
  /** El plan es anual: el texto dice «de cada año». */
  anual: boolean;
  onCerrar: () => void;
  onGuardada: (t: TarjetaGuardadaVista) => void;
}) {
  const t = useTextos();
  const k = t.bancard.tarjeta;
  const [paso, setPaso] = useState<Paso>('consentir');
  const [acepto, setAcepto] = useState(false);
  const [pideTelefono, setPideTelefono] = useState(false);
  const [telefono, setTelefono] = useState('');
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState<{ tarjeta: number; processId: string } | null>(null);
  const [guardada, setGuardada] = useState<TarjetaGuardadaVista | null>(null);
  const [motivoFallo, setMotivoFallo] = useState('');

  const telefonoVale = !pideTelefono || telefonoInternacional(telefono, zona) !== '';

  async function continuar() {
    if (!acepto || !telefonoVale) return;
    setPaso('abriendo');
    setError('');
    try {
      const r = await fetch('/api/pagos/bancard/tarjeta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa: empresaId, acepto: true, ...(pideTelefono ? { telefono: telefono.trim() } : {}) }),
      });
      const d = await r.json().catch(() => null);
      if (r.status === 422 && d?.falta === 'telefono') {
        setPideTelefono(true);
        setPaso('consentir');
        return;
      }
      if (r.ok && typeof d?.processId === 'string' && typeof d?.tarjeta === 'number') {
        setAbierto({ tarjeta: d.tarjeta, processId: d.processId });
        setPaso('formulario');
        return;
      }
      setError(mensajeDeError(d?.error, k.noSeGuardo));
    } catch (e) {
      setError(mensajeDeError(e, k.noSeGuardo));
    }
    setPaso('consentir');
  }

  // El formulario terminó: se le pregunta a Bancard, no al formulario.
  async function verificar() {
    if (!abierto) return;
    setPaso('verificando');
    try {
      const r = await fetch('/api/pagos/bancard/tarjeta/verificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa: empresaId, tarjeta: abierto.tarjeta }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.guardada === true) {
        setGuardada({ tarjeta: abierto.tarjeta, marca: d.marca ?? null, ultimos4: d.ultimos4 ?? null });
        setPaso('guardada');
        return;
      }
      setMotivoFallo(typeof d?.error === 'string' ? mensajeDeError(d.error, '') : '');
    } catch {
      setMotivoFallo('');
    }
    setPaso('fallo');
  }

  function listo() {
    if (guardada) onGuardada(guardada);
  }

  const pie = paso === 'consentir' || paso === 'abriendo' ? (
    <PieHoja>
      <button type="button" className="boton-principal min-h-[48px]" onClick={continuar} disabled={!acepto || !telefonoVale || paso === 'abriendo'}>
        {paso === 'abriendo' ? k.abriendo : k.continuar}
      </button>
    </PieHoja>
  ) : paso === 'formulario' ? (
    <PieHoja>
      <button type="button" className="boton-suave min-h-[48px]" onClick={() => { setAbierto(null); setPaso('consentir'); }}>
        {t.bancard.hoja.volver}
      </button>
    </PieHoja>
  ) : paso === 'guardada' ? (
    <PieHoja>
      <button type="button" className="boton-principal min-h-[48px]" onClick={listo}>{t.bancard.resultado.listo}</button>
    </PieHoja>
  ) : paso === 'fallo' ? (
    <PieHoja columnas={2}>
      <button type="button" className="boton-suave min-h-[48px]" onClick={onCerrar}>{t.comun.cerrar}</button>
      <button type="button" className="boton-principal min-h-[48px]" onClick={() => { setAbierto(null); setPaso('consentir'); }}>
        {k.probarDeNuevo}
      </button>
    </PieHoja>
  ) : null;

  return (
    <Hoja
      titulo={k.hojaTitulo}
      subtitulo={entorno === 'staging' ? t.bancard.pruebas.ambienteDePrueba : undefined}
      onCerrar={paso === 'guardada' ? listo : onCerrar}
      bloqueada={paso === 'abriendo' || paso === 'verificando'}
      cerrarConVelo={false}
      tamano="medio"
      pie={pie}
    >
      {paso === 'formulario' && abierto ? (
        <div className="space-y-3">
          <FormularioBancard
            espacio="Cards"
            processId={abierto.processId}
            entorno={entorno}
            urlScript={urlScript}
            origen={origen}
            onTermino={() => { void verificar(); }}
          />
          <p className="text-[12px] leading-relaxed text-tinta/50">{k.formularioSeguro}</p>
        </div>
      ) : paso === 'verificando' ? (
        <div className="flex items-center gap-3 rounded-2xl border border-borde p-4" aria-live="polite">
          <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-verde border-t-transparent" aria-hidden />
          <p className="text-[14px] font-semibold leading-relaxed">{k.verificando}</p>
        </div>
      ) : paso === 'guardada' && guardada ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-verde-claro text-verde-fuerte" aria-hidden>
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 13 4 4L19 7" />
              </svg>
            </span>
            <p className="text-[17px] font-bold tracking-tight">
              {guardada.marca && guardada.ultimos4 ? k.guardada(guardada.marca, guardada.ultimos4) : k.guardadaSinDetalle}
            </p>
          </div>
          <p className="text-[13.5px] leading-relaxed text-tinta/65">{k.guardadaDetalle}</p>
        </div>
      ) : paso === 'fallo' ? (
        <p role="alert" className="rounded-xl bg-ambar-claro px-3 py-2.5 text-[13.5px] font-medium leading-relaxed text-ambar">
          {motivoFallo ? k.noSeGuardoDetalle(motivoFallo) : k.noSeGuardo}
        </p>
      ) : (
        <div className="space-y-4">
          <p className="text-[13.5px] leading-relaxed text-tinta/70">{k.formularioSeguro}</p>
          <p className="text-[13.5px] leading-relaxed text-tinta/70">{anual ? k.guardarAnual : k.guardar}. {k.cuando}</p>
          <label className="flex items-start gap-3 rounded-2xl border border-borde bg-arena/40 p-4 text-[13.5px] leading-relaxed">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 shrink-0 accent-verde"
              checked={acepto}
              onChange={(e) => setAcepto(e.target.checked)}
            />
            <span className="font-semibold">{k.autorizo}</span>
          </label>
          {pideTelefono && (
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-semibold">{k.tuCelular}</span>
              <input
                className="campo w-full"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={telefono}
                maxLength={30}
                onChange={(e) => setTelefono(e.target.value)}
                autoFocus
              />
              <span className="mt-1 block text-[12px] text-tinta/50">
                {telefono.trim() && !telefonoVale ? k.celularInvalido : k.celularAyuda}
              </span>
            </label>
          )}
          <MensajeError texto={error} />
        </div>
      )}
    </Hoja>
  );
}
