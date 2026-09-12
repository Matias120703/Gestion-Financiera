'use client';

import { useState } from 'react';
import Link from 'next/link';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { enlaceDeSocio } from '@/lib/referido';

const trazo = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

/**
 * «¿CONOCÉS A ALGUIEN QUE TODAVÍA ANOTA ESTO EN UN CUADERNO?»
 *
 * El pedido de recomendación, en el momento en que la persona acaba de ver
 * que Orden le sirve: al cerrar un buen día, o justo después de pagar. En un
 * menú no lo abre nadie.
 *
 * TRES DECISIONES QUE SON LA TARJETA ENTERA
 *
 * · EL ENCABEZADO LO ESCRIBE LA PANTALLA, no este componente. «Cerraste el día
 *   con 1.240.000 de ganancia» es el motivo por el que este pedido no molesta;
 *   sin ese número es publicidad, y los números los tiene la pantalla.
 *
 * · NO TAPA NADA. Va abajo del número, se puede ignorar y no se mueve. Un
 *   cartel en el medio de la tarea es lo que hace que una app se vuelva
 *   molesta, y molestar para pedir un favor es la peor combinación.
 *
 * · CUÁNDO APARECER NO SE DECIDE ACÁ. Lo contesta `momento_de_recomendar`
 *   (062): cuenta con antigüedad, movimientos de verdad, al día, y sin
 *   habérselo pedido en el último mes. Si estuviera acá, el día que se agregue
 *   un tercer lugar donde pedirlo alguna regla se quedaría afuera.
 *
 * Aceptar es un solo toque: se le crea el código y aparece el botón de
 * WhatsApp con el mensaje escrito. No se lo manda a otra pantalla a leer
 * sobre comisiones — cada paso intermedio se come la mitad de los que iban a
 * hacerlo.
 */
export function TarjetaRecomendar({ encabezado }: { encabezado: string }) {
  const [estado, setEstado] = useState<'ofrecido' | 'generando' | 'listo' | 'oculto'>('ofrecido');
  const [codigo, setCodigo] = useState('');
  const [copiado, setCopiado] = useState(false);

  async function aceptar() {
    setEstado('generando');
    try {
      const { data, error } = await clienteNavegador().rpc('mi_codigo_socio');
      if (error) throw error;
      setCodigo(String((data as any)?.codigo ?? ''));
      setEstado('listo');
      // Ya no hace falta volver a ofrecérselo: de acá en adelante lo suyo lo
      // ve en «Recomendar».
      clienteNavegador().rpc('posponer_recomendacion');
    } catch {
      // Si falla, la tarjeta vuelve a como estaba y no se dice nada: es un
      // ofrecimiento, no algo que la persona haya pedido. Un error rojo acá
      // sería estropearle el cierre del día por algo que no le importa.
      setEstado('ofrecido');
    }
  }

  function ahoraNo() {
    setEstado('oculto');
    clienteNavegador().rpc('posponer_recomendacion');
  }

  if (estado === 'oculto') return null;

  const enlace = codigo ? enlaceDeSocio(codigo) : '';
  const mensaje = `Te paso Orden, lo uso para anotar las ventas y los gastos del negocio y ver la ganancia del día. Entrá por acá: ${enlace}`;

  return (
    <div className="rounded-2xl border border-verde/30 bg-verde-claro/30 p-4">
      {estado === 'listo' ? (
        <>
          <p className="text-[14.5px] font-bold leading-snug">Listo, este es tu enlace</p>
          <p className="mt-1 break-all rounded-xl bg-superficie px-3 py-2 text-[13px] font-semibold">
            {enlace}
          </p>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(enlace);
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 1800);
                } catch { /* sin portapapeles, el enlace está a la vista */ }
              }}
              className="boton-suave py-2.5 text-[13.5px]"
            >
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`}
              target="_blank" rel="noopener noreferrer"
              className="boton-principal flex items-center justify-center gap-2 py-2.5 text-[13.5px]"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" {...trazo}>
                <path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 21l2.2-5.2A8.5 8.5 0 1 1 21 11.5Z" />
              </svg>
              Mandar
            </a>
          </div>
          <Link href="/recomendar" className="mt-2.5 block text-center text-[12.5px] font-semibold text-verde-fuerte hover:underline">
            Ver cómo va →
          </Link>
        </>
      ) : (
        <>
          <p className="text-[14.5px] font-bold leading-snug">{encabezado}</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-tinta/65">
            ¿Conocés a alguien que todavía anota esto en un cuaderno? Si entra con tu enlace y paga
            su primer mes, <strong className="text-tinta">la mitad de ese pago es tuya</strong>.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button" onClick={aceptar} disabled={estado === 'generando'}
              className="boton-principal px-4 py-2 text-[13.5px]"
            >
              {estado === 'generando' ? 'Un segundo…' : 'Mandar mi enlace'}
            </button>
            <button
              type="button" onClick={ahoraNo}
              className="px-3 py-2 text-[13px] font-semibold text-tinta/45 hover:text-tinta/70"
            >
              Ahora no
            </button>
          </div>
        </>
      )}
    </div>
  );
}
