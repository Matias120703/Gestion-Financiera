'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Hoja, MensajeError, PieHoja } from '@/components/Hoja';
import { useIdioma, useTextos } from '@/i18n/cliente';
import { FICHA } from '@/i18n/idiomas';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { SelectorPersonas } from './SelectorPersonas';
import { HojaSumarPersonas, type DatosDelEquipo } from './HojaSumarPersonas';

/** Lo que `bancard_estado` (125) dice de las personas de un Premium con cantidad. */
export interface PersonasVista {
  contratadas: number;
  /** La baja programada para la próxima renovación, o null. */
  proxima: number | null;
  miembros: number;
  /** No menos que las que trae el plan ni que el equipo de hoy. */
  min: number;
  max: number;
}

/**
 * EL EQUIPO DE UN PREMIUM PAGO POR BANCARD, EN /plan: «Tu equipo: 6 personas
 * (5 en uso)», con los dos cambios posibles después de pagar.
 *
 *   · SUMAR PERSONAS se paga hoy, prorrateado por los días que faltan del
 *     período, y queda para las renovaciones (`HojaSumarPersonas`).
 *   · BAJAR rige desde la próxima renovación, no cobra nada y nunca por
 *     debajo de las personas que hoy tiene el equipo (`bancard_bajar_personas`,
 *     con la guarda de la base). Si hay una baja programada se muestra, con
 *     «Deshacer».
 *
 * Solo aparece con un Premium pago vigente que tiene cantidad (se pagó por
 * Bancard eligiendo las personas): un Premium «sin número», activado a mano,
 * primero se renueva eligiendo cuántas son.
 */
export function EquipoPremium({ datos, personas, renovacion }: {
  datos: Omit<DatosDelEquipo, 'contratadas' | 'miembros' | 'max'>;
  personas: PersonasVista;
  /** Cuándo vence el período pago (ISO): desde ahí rige la baja. */
  renovacion: string | null;
}) {
  const t = useTextos();
  const q = t.bancard.equipo;
  const locale = FICHA[useIdioma()].locale;
  const router = useRouter();
  const [sumando, setSumando] = useState(false);
  const [bajando, setBajando] = useState(false);
  const [cantidad, setCantidad] = useState(Math.max(personas.min, personas.contratadas - 1));
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');

  const puedeSumar = personas.contratadas < personas.max;
  const puedeBajar = personas.contratadas - 1 >= personas.min;
  const fecha = renovacion
    ? new Date(renovacion).toLocaleDateString(locale, { day: 'numeric', month: 'long', timeZone: datos.zona })
    : '';

  /** `null` deshace la baja programada. */
  async function programar(n: number | null) {
    setOcupado(true);
    setError('');
    try {
      const { error: e } = await clienteNavegador().rpc('bancard_bajar_personas', { p_empresa: datos.empresaId, p_personas: n });
      if (e) {
        setError(mensajeDeError(e, q.noSePudo));
        return;
      }
      setBajando(false);
      setAviso(n === null ? q.deshecha : q.bajaLista);
      router.refresh();
    } catch (e) {
      setError(mensajeDeError(e, q.noSePudo));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="tarjeta p-4">
      <p className="titulo-seccion mb-1.5">{q.titulo}</p>
      <p className="text-[15px] font-bold">{q.personas(personas.contratadas, personas.miembros)}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-tinta/65">{q.contratadas}</p>
      {personas.proxima !== null && (
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-ambar-claro px-3 py-2 text-[13px] font-medium text-ambar">
          <span>{q.bajaProgramada(personas.proxima, fecha)}</span>
          <button type="button" className="font-bold underline-offset-2 hover:underline disabled:opacity-50" onClick={() => programar(null)} disabled={ocupado}>
            {q.deshacer}
          </button>
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="boton-principal px-4 py-2 text-[13.5px]" onClick={() => setSumando(true)} disabled={!puedeSumar} title={puedeSumar ? undefined : q.maximo}>
          {q.sumar}
        </button>
        {puedeBajar && personas.proxima === null && (
          <button type="button" className="boton-suave px-4 py-2 text-[13.5px]" onClick={() => { setError(''); setBajando(true); }}>
            {q.bajar}
          </button>
        )}
      </div>
      {aviso && <p className="mt-3 rounded-xl bg-verde-claro/60 px-3 py-2 text-[13px] font-medium text-verde-fuerte" role="status">{aviso}</p>}
      {error && !bajando && <p className="mt-3 rounded-xl bg-rojo-claro px-3 py-2 text-[13px] font-medium text-rojo" role="alert">{error}</p>}

      {sumando && (
        <HojaSumarPersonas
          datos={{ ...datos, contratadas: personas.contratadas, miembros: personas.miembros, max: personas.max, proxima: personas.proxima }}
          onCerrar={() => { setSumando(false); setAviso(''); }}
        />
      )}

      {bajando && (
        <Hoja
          titulo={q.bajarTitulo}
          onCerrar={() => { if (!ocupado) setBajando(false); }}
          bloqueada={ocupado}
          cerrarConVelo={false}
          tamano="chico"
          pie={(
            <PieHoja>
              <button type="button" className="boton-principal min-h-[48px]" onClick={() => programar(cantidad)} disabled={ocupado}>
                {q.programar}
              </button>
            </PieHoja>
          )}
        >
          <div className="space-y-4">
            <p className="text-[13.5px] leading-relaxed text-tinta/70">{q.bajarDetalle}</p>
            <SelectorPersonas
              valor={cantidad}
              min={personas.min}
              max={personas.contratadas - 1}
              miembros={personas.miembros}
              onCambio={setCantidad}
            />
            {fecha && <p className="text-[12.5px] leading-relaxed text-tinta/60">{q.bajaProgramada(cantidad, fecha)}</p>}
            <MensajeError texto={error} />
          </div>
        </Hoja>
      )}
    </div>
  );
}
