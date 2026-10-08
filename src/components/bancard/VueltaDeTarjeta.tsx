'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTextos } from '@/i18n/cliente';
import { leerLoQueDijoElFormulario, tarjetaYaCatastrada, textoDeLoQueDijo } from '@/lib/bancard-formulario';
import { ContactoDePago } from './ContactoDePago';

/**
 * LA VUELTA DEL CATASTRO (el `return_url` de cards/new: /plan/tarjeta/[tarjeta]).
 *
 * Si la librería de Bancard navega acá en vez de avisar adentro de la hoja,
 * esta pantalla hace lo mismo que la hoja: le pide al servidor que compruebe
 * con Bancard si la tarjeta quedó (nada de lo que diga la dirección cuenta)
 * y, si quedó, vuelve a /plan, donde se la ve guardada.
 *
 * La librería, cuando navega, le agrega a la dirección lo que dijo el
 * formulario (`?status=…&description=…`). Igual que en la hoja, eso NO
 * DECIDE NADA: viaja al servidor para quedar anotado y, si la tarjeta no
 * quedó, se muestra («Bancard respondió: …»), con la ayuda de la cédula en el
 * ambiente de prueba. En ese caso la pantalla NO se va sola a /plan: ahí no
 * queda rastro del intento, y un segundo y medio no alcanza para leer por
 * qué falló (07/10/2026). Se vuelve con el enlace de abajo.
 *
 * Como la hoja, distingue dos respuestas: si Bancard contestó que la tarjeta
 * ya está guardada en el comercio, debajo va qué puede hacer la persona; y si
 * el servidor contestó `sin_confirmar` (el formulario dijo que la guardó y
 * Bancard todavía no la lista), se le dice que se vuelve a mirar sola y que
 * no la cargue otra vez, en vez de «No se pudo guardar».
 */
export function VueltaDeTarjeta({
  tarjeta, empresaId, entorno,
}: {
  tarjeta: number;
  empresaId: string;
  /** El ambiente de Bancard del servidor (null: sin configurar). */
  entorno: 'staging' | 'produccion' | null;
}) {
  const t = useTextos();
  const k = t.bancard.tarjeta;
  const router = useRouter();
  const [texto, setTexto] = useState(k.vueltaComprobando);
  const [fallo, setFallo] = useState(false);
  const [respuestaDeBancard, setRespuestaDeBancard] = useState('');
  const [yaCatastrada, setYaCatastrada] = useState(false);
  const [sinConfirmar, setSinConfirmar] = useState(false);

  useEffect(() => {
    let vivo = true;
    const direccion = new URLSearchParams(window.location.search);
    const formulario = leerLoQueDijoElFormulario({
      status: direccion.get('status'),
      description: direccion.get('description'),
    });
    (async () => {
      // Si el servidor no llega a contestar, queda lo que trajo la dirección.
      let dicho = formulario;
      try {
        const r = await fetch('/api/pagos/bancard/tarjeta/verificar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ empresa: empresaId, tarjeta, ...(formulario ? { formulario } : {}) }),
        });
        const d = await r.json().catch(() => null);
        if (!vivo) return;
        if (r.ok && d?.guardada === true) {
          setTexto(d.marca && d.ultimos4 ? k.guardada(d.marca, d.ultimos4) : k.guardadaSinDetalle);
          window.setTimeout(() => { if (vivo) router.replace('/plan'); }, 1500);
          return;
        }
        if (r.ok && d?.motivo === 'sin_confirmar') {
          setSinConfirmar(true);
          return;
        }
        dicho = leerLoQueDijoElFormulario(d?.formulario) ?? dicho;
      } catch {
        if (!vivo) return;
      }
      setRespuestaDeBancard(textoDeLoQueDijo(dicho));
      setYaCatastrada(tarjetaYaCatastrada(dicho));
      setFallo(true);
    })();
    return () => { vivo = false; };
  }, [tarjeta]); // eslint-disable-line react-hooks/exhaustive-deps

  if (sinConfirmar) {
    return (
      <p role="status" className="rounded-xl bg-arena px-3 py-2.5 text-[13.5px] leading-relaxed text-tinta/75">{k.sinConfirmar}</p>
    );
  }

  if (fallo) {
    return (
      <div className="space-y-3">
        <div role="alert" className="space-y-1 rounded-xl bg-ambar-claro px-3 py-2.5 text-[13.5px] leading-relaxed text-ambar">
          <p className="font-medium">{k.noSeGuardo}</p>
          {respuestaDeBancard && <p className="break-words">{k.bancardRespondio(respuestaDeBancard)}</p>}
        </div>
        {yaCatastrada && (
          <div className="space-y-2 rounded-xl border border-borde px-3 py-2.5 text-[13px] leading-relaxed text-tinta/75">
            <p>{k.yaCatastrada}</p>
            {entorno === 'staging' && <p className="text-tinta/55">{k.yaCatastradaPruebas}</p>}
            <ContactoDePago />
          </div>
        )}
        {entorno === 'staging' && (
          <p className="rounded-xl bg-arena px-3 py-2.5 text-[12.5px] leading-relaxed text-tinta/65">{k.ayudaDePruebas}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-borde p-4" aria-live="polite">
      <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-verde border-t-transparent" aria-hidden />
      <p className="text-[14px] font-semibold leading-relaxed">{texto}</p>
    </div>
  );
}
