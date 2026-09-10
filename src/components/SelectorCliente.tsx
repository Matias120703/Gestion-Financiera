'use client';

import { useEffect, useRef, useState } from 'react';
import { clienteNavegador } from '@/lib/supabase/cliente';

export interface ClienteElegido {
  id: string | null;
  nombre: string;
  telefono: string;
}

interface Sugerencia { id: string; nombre: string; telefono: string }

/**
 * ELEGIR UN CLIENTE, O CREARLO SIN SALIR DE ACÁ
 *
 * Antes esto era un campo de texto libre que solo guardaba un nombre en la
 * venta. Servía para acordarse, no para nada más: si el mismo cliente volvía,
 * había que escribir todo de nuevo, y no había forma de preguntarle al
 * sistema cuánto le debe.
 *
 * DOS COSAS AL MISMO TIEMPO, Y ES A PROPÓSITO
 *
 * Se escribe el nombre y, mientras se escribe, aparece quién ya está cargado.
 * No hay un botón «buscar» y otro «crear nuevo»: en un mostrador con alguien
 * esperando, esa decisión de más es la que hace que se termine escribiendo
 * cualquier cosa. Si aparece, se toca; si no, lo que se escribió ya es el
 * cliente nuevo.
 *
 * EL TELÉFONO SOLO CUANDO IMPORTA
 *
 * Aparece solo si hace falta —al fiar—, porque es cuando se vuelve necesario
 * de verdad: a quien te debe hay que poder llamarlo. Pedirlo siempre haría
 * que se invente un número para salir del paso, y un número inventado es peor
 * que ninguno: hace que dos personas distintas terminen en la misma ficha.
 */
export function SelectorCliente({
  empresaId, valor, alElegir, pedirTelefono = false, etiqueta = 'Cliente', obligatorio = false,
  placeholder, ayudaTelefono,
}: {
  empresaId: string;
  valor: ClienteElegido;
  alElegir: (c: ClienteElegido) => void;
  pedirTelefono?: boolean;
  etiqueta?: string;
  obligatorio?: boolean;
  /** Nació para el fiado; en la agenda el campo pide otra cosa. */
  placeholder?: string;
  /** Para qué se pide el teléfono. Cambia según dónde se usa. */
  ayudaTelefono?: string;
}) {
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  // Se busca mientras se escribe, con un respiro: sin esto, cada letra de
  // «Juan» sería una consulta y la última en volver podría no ser la de lo
  // que hay escrito ahora.
  useEffect(() => {
    if (valor.id || valor.nombre.trim().length < 2) { setSugerencias([]); return; }
    let vigente = true;
    const t = setTimeout(async () => {
      try {
        const { data } = await clienteNavegador().rpc('buscar_clientes', {
          p_empresa: empresaId, p_texto: valor.nombre, p_limite: 6,
        });
        if (vigente) setSugerencias(Array.isArray(data) ? data : []);
      } catch { if (vigente) setSugerencias([]); }
    }, 250);
    return () => { vigente = false; clearTimeout(t); };
  }, [valor.nombre, valor.id, empresaId]);

  // Cerrar al tocar afuera. Sin esto la lista queda tapando el total.
  useEffect(() => {
    function afuera(e: MouseEvent) {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener('mousedown', afuera);
    return () => document.removeEventListener('mousedown', afuera);
  }, []);

  const hayLista = abierto && sugerencias.length > 0 && !valor.id;

  return (
    <div className="space-y-2.5">
      <div className="relative" ref={caja}>
        <span className="etiqueta">
          {etiqueta}
          {obligatorio && <span className="ml-1 text-rojo">*</span>}
        </span>

        <div className="relative">
          <input
            className="campo py-2.5 pr-9"
            placeholder={placeholder ?? (obligatorio ? 'Nombre de quien se lleva fiado' : 'Opcional')}
            value={valor.nombre}
            onFocus={() => setAbierto(true)}
            onChange={(e) => {
              // Al escribir se suelta el cliente elegido: si no, el nombre
              // en pantalla diría una cosa y la venta se guardaría con otra.
              alElegir({ id: null, nombre: e.target.value, telefono: valor.telefono });
              setAbierto(true);
            }}
          />
          {valor.id && (
            <button
              type="button"
              onClick={() => alElegir({ id: null, nombre: '', telefono: '' })}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-1.5 py-1 text-tinta/40 hover:bg-arena hover:text-tinta"
              aria-label="Quitar el cliente"
            >
              ✕
            </button>
          )}
        </div>

        {valor.id && (
          <p className="mt-1 text-[12px] font-semibold text-verde-fuerte">
            ✓ Cliente ya registrado{valor.telefono ? ` · ${valor.telefono}` : ''}
          </p>
        )}

        {hayLista && (
          <ul className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-borde bg-white shadow-tarjeta">
            {sugerencias.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    alElegir({ id: s.id, nombre: s.nombre, telefono: s.telefono });
                    setAbierto(false);
                  }}
                  className="flex w-full items-baseline justify-between gap-3 px-3 py-2.5 text-left hover:bg-arena"
                >
                  <span className="text-[14px] font-semibold">{s.nombre}</span>
                  {s.telefono && (
                    <span className="shrink-0 text-[12px] tabular-nums text-tinta/45">{s.telefono}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pedirTelefono && !valor.id && (
        <label className="block aparecer">
          <span className="etiqueta">Teléfono</span>
          <input
            className="campo py-2.5"
            inputMode="tel"
            placeholder="0981 234 567"
            value={valor.telefono}
            onChange={(e) => alElegir({ ...valor, telefono: e.target.value })}
          />
          <span className="mt-1 block text-[12px] leading-snug text-tinta/45">
            {ayudaTelefono ?? 'Para poder ubicarlo cuando haya que cobrarle. Si no lo tenés, dejalo vacío.'}
          </span>
        </label>
      )}
    </div>
  );
}

/**
 * Deja el cliente listo para usar: si ya estaba elegido devuelve su id, y si
 * se escribió uno nuevo lo crea.
 *
 * Se llama desde quien guarda —la venta, el turno— y no desde el campo,
 * porque crear una ficha por cada nombre a medio escribir llenaría la lista
 * de basura: «J», «Ju», «Jua».
 */
export async function asegurarCliente(
  empresaId: string, c: ClienteElegido,
): Promise<string | null> {
  if (c.id) return c.id;
  if (c.nombre.trim().length === 0) return null;

  const { data, error } = await clienteNavegador().rpc('guardar_cliente', {
    p_empresa: empresaId,
    p_nombre: c.nombre.trim(),
    p_telefono: c.telefono.trim(),
  });
  if (error) throw error;
  return (data as string) ?? null;
}
