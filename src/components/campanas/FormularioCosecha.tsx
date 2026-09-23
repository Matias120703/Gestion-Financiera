'use client';

import { useMemo, useState } from 'react';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { useLocale, useTextos } from '@/i18n/cliente';
import { avisoHumedad, avisoRinde, cultivoPorNombre, merma } from '@/lib/agricultura';
import { CampoMonto } from '@/components/CampoMonto';
import { Confirmar, Hoja, MensajeError } from '@/components/rutinas/panel/Piezas';
import { useAccion } from '@/components/rutinas/panel/useAccion';
import { fechaCorta } from '@/components/rutinas/panel/utiles';
import type { Cosecha, Lote } from '@/lib/tipos';
import { kilos, unDecimal } from './utiles';

/**
 * CARGAR LA COSECHA (flujo C, 10 segundos por camión).
 *
 * Lo único que importa arriba de un camión son los KILOS QUE TE
 * ACREDITARON: van grandes, con el teclado numérico, y un toque los deja
 * escribir en toneladas (28,665 t). Todo lo demás del ticket —peso de
 * balanza, humedad, destino, número— va plegado: sirve, pero no frena.
 *
 * El id lo genera el celular al abrir la hoja (`crypto.randomUUID`): si la
 * señal se corta después de apretar Guardar y la persona vuelve a apretar,
 * la base reconoce el mismo ticket y no lo carga dos veces.
 *
 * La carga cualquier miembro: el que pesa el camión puede ser el peón.
 */
export function FormularioCosecha({
  empresaId, lote, hoy, destinos, onCerrar, onListo,
}: {
  empresaId: string;
  lote: Lote;
  hoy: string;
  /** Los destinos que ya usó en esta campaña, para elegir a un toque. */
  destinos: string[];
  onCerrar: () => void;
  onListo: (mensaje: string) => void;
}) {
  const t = useTextos();
  const c = t.campanas.cosecha;
  const locale = useLocale();
  const { ocupado, error, setError, correr } = useAccion();

  // Una vez por hoja: el mismo ticket reintentado es el mismo id.
  const [id] = useState(() => crypto.randomUUID());
  const [fecha, setFecha] = useState(hoy);
  const [enToneladas, setEnToneladas] = useState(false);
  const [netos, setNetos] = useState(0);
  const [mas, setMas] = useState(false);
  const [brutos, setBrutos] = useState(0);
  const [humedad, setHumedad] = useState(0);
  const [destino, setDestino] = useState('');
  const [ticket, setTicket] = useState('');
  const [notas, setNotas] = useState('');

  // En toneladas se escribe 28,665 y se guarda 28665: la base cuenta kilos enteros.
  const kgNetos = Math.round(enToneladas ? netos * 1000 : netos);
  const kgBrutos = Math.round(brutos);
  const pctMerma = kgBrutos > 0 && kgNetos > 0 ? merma(kgBrutos, kgNetos) : null;

  // El rinde con este ticket sumado: si se va del rango del cultivo, avisa
  // (un cero de más en los kilos se nota acá, no en el cierre).
  const rango = cultivoPorNombre(lote.cultivo).rinde;
  const rindeNuevo = lote.hectareas && kgNetos > 0
    ? (Number(lote.kg_cosechados) + kgNetos) / Number(lote.hectareas) : null;
  const avisoR = rindeNuevo !== null ? avisoRinde(cultivoPorNombre(lote.cultivo).clave, rindeNuevo) : 'ok';
  const avisoH = humedad > 0 ? avisoHumedad(humedad) : 'ok';

  const destinosUnicos = useMemo(() => [...new Set(destinos.map((d) => d.trim()).filter(Boolean))].slice(0, 6), [destinos]);

  const fechaMala = !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha < lote.abierto_el || fecha > hoy;
  const brutosMal = kgBrutos > 0 && kgBrutos < kgNetos;
  const bloqueado = kgNetos <= 0 || fechaMala || brutosMal || avisoH === 'bloqueo';

  async function guardar() {
    if (kgNetos <= 0) { setError(c.kilosCero); return; }
    if (bloqueado) return;
    const r = await correr(() => clienteNavegador().rpc('registrar_cosecha', {
      p_empresa: empresaId,
      p_lote: lote.id,
      p_fecha: fecha,
      p_kg_netos: kgNetos,
      p_kg_brutos: kgBrutos > 0 ? kgBrutos : null,
      p_humedad: humedad > 0 ? humedad : null,
      p_destino: destino.trim(),
      p_ticket: ticket.trim(),
      p_notas: notas.trim(),
      p_id: id,
    }));
    if (r.ok) onListo(c.listo(kilos(kgNetos, locale)));
  }

  return (
    <Hoja titulo={c.titulo} onCerrar={onCerrar} bloqueada={ocupado}>
      <p className="-mt-1 text-[13px] leading-relaxed text-tinta/55">{c.detalle}</p>
      {lote.estado === 'cerrado' && (
        <p className="mt-2 rounded-xl bg-ambar-claro px-3 py-2 text-[12.5px] font-medium text-ambar">{c.enLoteCerrado}</p>
      )}

      <div className="mt-4 space-y-4">
        {/* ---- lo que importa: los kilos acreditados, grandes ---- */}
        <div>
          <label className="etiqueta" htmlFor="cosecha-netos">{c.kgNetos}</label>
          <div className="relative">
            <CampoMonto id="cosecha-netos" autoFocus disabled={ocupado}
              className="campo pr-12 text-[26px] font-bold tabular-nums"
              decimales={enToneladas ? 3 : 0} valor={netos}
              alCambiar={(n) => { setNetos(n); setError(''); }} />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[15px] font-semibold text-tinta/45">
              {enToneladas ? c.unidadT : c.unidadKg}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="text-[12px] text-tinta/45">
              {enToneladas && kgNetos > 0 ? c.enKg(kilos(kgNetos, locale)) : c.kgNetosDetalle}
            </span>
            <button type="button" className="boton-texto min-h-[44px] shrink-0 text-[12.5px]" disabled={ocupado}
              onClick={() => {
                // Se convierte lo escrito: nadie quiere volver a tipear el número.
                setNetos(enToneladas ? kgNetos : kgNetos / 1000);
                setEnToneladas((v) => !v);
              }}>
              {enToneladas ? c.enKilos : c.enToneladas}
            </button>
          </div>
          {avisoR === 'aviso' && rango && (
            <p className="mt-1 text-[12.5px] font-medium text-ambar">
              {c.rindeRaro(kilos(rango.min, locale), kilos(rango.max, locale))}
            </p>
          )}
        </div>

        <div>
          <label className="etiqueta" htmlFor="cosecha-fecha">{c.fecha}</label>
          <input id="cosecha-fecha" type="date" className="campo" value={fecha} disabled={ocupado}
            min={lote.abierto_el} max={hoy} onChange={(e) => setFecha(e.target.value)} />
        </div>

        {/* ---- el resto del ticket, plegado ---- */}
        <button type="button" className="boton-texto min-h-[44px] text-[13px]" aria-expanded={mas}
          onClick={() => setMas((v) => !v)}>
          {mas ? c.menosDatos : c.masDatos}
        </button>

        {mas && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="etiqueta" htmlFor="cosecha-brutos">{c.kgBrutos}</label>
                <CampoMonto id="cosecha-brutos" className="campo" decimales={0} valor={brutos} disabled={ocupado}
                  alCambiar={setBrutos} />
              </div>
              <div>
                <label className="etiqueta" htmlFor="cosecha-humedad">{c.humedad}</label>
                <div className="relative">
                  <CampoMonto id="cosecha-humedad" className="campo pr-9" decimales={1} valor={humedad}
                    disabled={ocupado} alCambiar={setHumedad} />
                  <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[14px] text-tinta/45">
                    {c.unidadPorcentaje}
                  </span>
                </div>
              </div>
            </div>
            <p className="-mt-2 text-[12px] leading-snug text-tinta/45">
              {pctMerma !== null ? c.merma(unDecimal(pctMerma, locale)) : c.kgBrutosDetalle}
            </p>
            {brutosMal && <p className="-mt-2 text-[12.5px] font-medium text-rojo">{c.netosMasQueBrutos}</p>}
            {avisoH === 'aviso' && <p className="-mt-2 text-[12.5px] font-medium text-ambar">{c.humedadAlta}</p>}
            {avisoH === 'bloqueo' && <p className="-mt-2 text-[12.5px] font-medium text-rojo">{c.humedadFuera}</p>}

            <div>
              <label className="etiqueta" htmlFor="cosecha-destino">{c.destino}</label>
              {destinosUnicos.length > 0 && (
                <div className="mb-2 flex gap-2 overflow-x-auto scroll-limpio">
                  {destinosUnicos.map((d) => (
                    <button key={d} type="button" disabled={ocupado}
                      className={destino.trim() === d ? 'chip-encendido' : 'chip-apagado'}
                      onClick={() => setDestino(d)}>
                      {d}
                    </button>
                  ))}
                </div>
              )}
              <input id="cosecha-destino" className="campo" maxLength={80} value={destino} disabled={ocupado}
                placeholder={c.destinoEjemplo} onChange={(e) => setDestino(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="etiqueta" htmlFor="cosecha-ticket">{c.ticket}</label>
                <input id="cosecha-ticket" className="campo" maxLength={40} value={ticket} disabled={ocupado}
                  placeholder={c.ticketEjemplo} onChange={(e) => setTicket(e.target.value)} />
              </div>
              <div>
                <label className="etiqueta" htmlFor="cosecha-notas">{c.notas}</label>
                <input id="cosecha-notas" className="campo" maxLength={300} value={notas} disabled={ocupado}
                  onChange={(e) => setNotas(e.target.value)} />
              </div>
            </div>
          </div>
        )}
      </div>

      <MensajeError texto={error} />

      <button type="button" className="boton-principal mt-5 min-h-[48px] w-full"
        disabled={ocupado || bloqueado} onClick={guardar}>
        {ocupado ? t.comun.guardando : c.guardar}
      </button>
    </Hoja>
  );
}

/**
 * Los tickets de la campaña, con borrar. Lo borra administración o quien lo
 * cargó (un peón que se equivocó de campaña lo arregla solo); la base lo
 * vuelve a mirar igual.
 */
export function ListaCosechas({
  empresaId, cosechas, esAdmin, userId, hoy, onCambio,
}: {
  empresaId: string;
  cosechas: Cosecha[];
  esAdmin: boolean;
  userId: string;
  hoy: string;
  onCambio: (mensaje: string) => void;
}) {
  const t = useTextos();
  const c = t.campanas.cosecha;
  const locale = useLocale();
  const { ocupado, error, setError, correr } = useAccion();
  const [borrando, setBorrando] = useState<Cosecha | null>(null);

  if (cosechas.length === 0) return <p className="text-[13px] text-tinta/50">{c.sinTickets}</p>;

  return (
    <>
      <ul className="divide-y divide-borde/70">
        {cosechas.map((x) => {
          const pct = merma(x.kg_brutos, Number(x.kg_netos));
          const detalle = [
            fechaCorta(x.fecha, locale, hoy),
            x.destino,
            x.ticket && `#${x.ticket}`,
            x.humedad !== null && x.humedad !== undefined ? `${unDecimal(Number(x.humedad), locale)} ${c.unidadPorcentaje}` : '',
            pct !== null ? c.merma(unDecimal(pct, locale)) : '',
          ].filter(Boolean).join(' · ');
          return (
            <li key={x.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold tabular-nums">
                  {t.campanas.tarjeta.kilos(kilos(x.kg_netos, locale))}
                </span>
                <span className="block truncate text-[11.5px] text-tinta/45">{detalle}</span>
              </span>
              {(esAdmin || x.creado_por === userId) && (
                <button type="button" className="boton-texto min-h-[44px] shrink-0 px-1 text-[12.5px]"
                  disabled={ocupado} onClick={() => { setError(''); setBorrando(x); }}>
                  {c.borrar}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {borrando && (
        <Confirmar
          titulo={c.confirmarBorrar(kilos(borrando.kg_netos, locale), fechaCorta(borrando.fecha, locale, hoy))}
          si={c.borrar} peligro ocupado={ocupado} error={error}
          onNo={() => setBorrando(null)}
          onSi={async () => {
            const r = await correr(() => clienteNavegador().rpc('borrar_cosecha', {
              p_empresa: empresaId, p_id: borrando.id,
            }));
            if (r.ok) { setBorrando(null); onCambio(c.borrado); }
          }}
        />
      )}
    </>
  );
}
