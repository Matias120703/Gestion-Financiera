'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { decimalesDe, dinero, fechaLegible, simboloDe } from '@/lib/formato';
import { TIPOS_DE_BIEN, tipoDeBien } from '@/lib/patrimonio';
import { useLocale, useTextos } from '@/i18n/cliente';
import type { Bien, TipoBien } from '@/lib/tipos';
import { CampoMonto } from '@/components/CampoMonto';
import { Hoja, MensajeError, PieHoja } from '@/components/Hoja';
import { ElegirMoneda } from '@/components/billetera/ElegirMoneda';

/** Para qué se abre la hoja: anotar algo nuevo, corregir cómo se llama, o ponerle el valor de hoy. */
export type QueHacerConUnBien =
  | { modo: 'nuevo' }
  | { modo: 'editar'; bien: Bien }
  | { modo: 'valor'; bien: Bien };

/**
 * ALGO QUE TENÉS (132): un auto, un terreno, una casa.
 *
 * Matías: «También tiene que ver lo que sería patrimonios; por ejemplo, un
 * auto, un terreno, lo que sea».
 *
 * ES UNA ANOTACIÓN CON UN VALOR, Y NADA MÁS. No pregunta de qué cuenta salió
 * la plata ni cuánto costó: anotarlo no mueve ninguna cuenta, no es un gasto
 * y no entra en la ganancia. Cada vínculo entre un bien y una cuenta sería
 * una manera nueva de que algo no cierre, y por eso se dice al pie.
 *
 * Tres usos, una sola hoja:
 *   · nuevo  — qué es, cuánto vale hoy y en qué moneda (la del negocio ya
 *              viene marcada: quien no usa otra no toca nada);
 *   · editar — el nombre, el tipo y la nota. El valor NO se cambia acá (la
 *              base lo ignora si se manda): para eso está «Actualizar valor»;
 *   · valor  — un solo campo. Guardar le pone la fecha de hoy, también con
 *              el mismo número: es decir «sí, sigue valiendo eso».
 *
 * El valor lo calcula la persona. Orden no lo adivina ni lo deprecia.
 */
export function HojaBien({
  empresaId, moneda, que, onCerrar,
}: {
  empresaId: string;
  /** La moneda del negocio: la que viene marcada al anotar. */
  moneda: string;
  que: QueHacerConUnBien;
  onCerrar: () => void;
}) {
  const t = useTextos();
  const p = t.monedas.patrimonio;
  const locale = useLocale();
  const router = useRouter();
  const bien = que.modo === 'nuevo' ? null : que.bien;

  const [tipo, setTipo] = useState<TipoBien>(bien ? tipoDeBien(bien.tipo) : 'vehiculo');
  const [nombre, setNombre] = useState(bien?.nombre ?? '');
  const [nota, setNota] = useState(bien?.nota ?? '');
  const [valor, setValor] = useState(bien?.valor ?? 0);
  const [monedaBien, setMonedaBien] = useState(bien?.moneda ?? moneda);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  // El botón se apaga al guardar, pero eso llega con el dibujo siguiente:
  // esto frena el segundo toque aunque caiga antes.
  const enCurso = useRef(false);

  const conNombre = que.modo !== 'valor';
  const conValor = que.modo !== 'editar';
  const listo = (!conNombre || nombre.trim() !== '') && (!conValor || valor > 0);

  const elegirMoneda = (codigo: string) => {
    setMonedaBien(codigo);
    // Lo ya escrito se queda, sin los centavos que la moneda nueva no tiene.
    const f = 10 ** decimalesDe(codigo);
    setValor((v) => Math.round(v * f) / f);
  };

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (enCurso.current || !listo) return;
    enCurso.current = true;
    setGuardando(true);
    setError('');
    try {
      const supabase = clienteNavegador();
      const { error: fallo } = que.modo === 'valor'
        ? await supabase.rpc('actualizar_valor_bien', {
          p_empresa: empresaId, p_id: que.bien.id, p_valor: valor,
        })
        : que.modo === 'editar'
          // Siempre los tres: lo que no se manda, la base lo deja en su valor
          // por defecto (un tipo sin mandar volvería a «otro»).
          ? await supabase.rpc('guardar_bien', {
            p_empresa: empresaId, p_nombre: nombre.trim(), p_tipo: tipo, p_nota: nota.trim(), p_id: que.bien.id,
          })
          : await supabase.rpc('guardar_bien', {
            p_empresa: empresaId, p_nombre: nombre.trim(), p_tipo: tipo,
            p_valor: valor, p_moneda: monedaBien, p_nota: nota.trim(),
          });
      if (fallo) throw fallo;
      router.refresh();
      onCerrar();
    } catch (fallo) {
      setError(mensajeDeError(fallo, t.errores.generico));
    } finally {
      enCurso.current = false;
      setGuardando(false);
    }
  }

  const titulo = que.modo === 'nuevo' ? p.algoQueTenes : que.modo === 'editar' ? t.billetera.editar : p.actualizarValor;
  const subtitulo = que.modo === 'valor'
    ? `${que.bien.nombre} · ${p.valorDel(fechaLegible(que.bien.valor_al, false, locale))}`
    : que.modo === 'editar' ? que.bien.nombre : undefined;

  return (
    <Hoja
      titulo={titulo} subtitulo={subtitulo}
      onCerrar={onCerrar} bloqueada={guardando} tamano={que.modo === 'valor' ? 'chico' : 'medio'}
      formulario={{ onSubmit: guardar, noValidate: true }}
      pie={(
        <PieHoja>
          <button type="submit" className="boton-principal min-h-[48px]" disabled={guardando || !listo}>
            {guardando ? t.comun.guardando : t.comun.guardar}
          </button>
        </PieHoja>
      )}
    >
      <div className="space-y-4">
        {conNombre && (
          <>
            <div role="group" aria-label={p.algoQueTenes} className="flex flex-wrap gap-2">
              {TIPOS_DE_BIEN.map((x) => (
                <button
                  key={x} type="button" disabled={guardando}
                  aria-pressed={x === tipo}
                  onClick={() => setTipo(x)}
                  className={`${x === tipo ? 'chip-encendido' : 'chip-apagado'} disabled:opacity-50`}
                >
                  {p.tipos[x] ?? x}
                </button>
              ))}
            </div>

            <label className="block">
              <span className="etiqueta">{p.queEs}</span>
              <input
                className="campo" maxLength={60} value={nombre} disabled={guardando}
                onChange={(e) => setNombre(e.target.value)}
                placeholder={p.ejemplo[tipo] ?? ''}
              />
            </label>
          </>
        )}

        {conValor && (
          <div>
            <label className="block">
              {/* La moneda se ve al lado de la pregunta: en el campo va solo el número. */}
              <span className="etiqueta flex items-baseline justify-between gap-3">
                <span>{p.cuantoValeHoy}</span>
                <span className="font-medium text-tinta/45">{simboloDe(monedaBien)}</span>
              </span>
              <CampoMonto
                key={monedaBien} className="campo text-[18px] font-semibold" autoFocus={que.modo === 'valor'}
                decimales={decimalesDe(monedaBien)} placeholder={dinero(0, monedaBien, true, locale)}
                valor={valor} alCambiar={(n) => setValor(Math.max(0, n))} disabled={guardando}
              />
            </label>
            {que.modo === 'nuevo' && (
              <div className="mt-3">
                <ElegirMoneda propia={moneda} valor={monedaBien} alElegir={elegirMoneda} deshabilitado={guardando} />
              </div>
            )}
            <p className="mt-2 text-[12.5px] leading-snug text-tinta/55">{p.valorDetalle}</p>
          </div>
        )}

        {conNombre && (
          <label className="block">
            <span className="etiqueta">{p.nota}</span>
            <input
              className="campo" maxLength={200} value={nota} disabled={guardando}
              onChange={(e) => setNota(e.target.value)}
            />
          </label>
        )}

        {que.modo === 'nuevo' && (
          <p className="text-[12px] leading-snug text-tinta/45">{p.noMueveCuentas}</p>
        )}
      </div>
      <MensajeError texto={error} />
    </Hoja>
  );
}
