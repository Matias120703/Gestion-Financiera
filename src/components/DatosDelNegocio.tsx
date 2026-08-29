'use client';

import { LISTA_RUBROS } from '@/lib/rubros';
import { CANALES, type DatosRegistro } from '@/lib/registro';
import { useTextos } from '@/i18n/cliente';
import type { Rubro } from '@/lib/tipos';

/**
 * LAS PREGUNTAS DEL PRIMER PASO
 *
 * Vive acá y no dentro de una pantalla porque se usa en dos lugares: al
 * registrarse (`/crear`) y al armar la empresa de alguien que ya tiene
 * sesión (`/empezar`). Dos copias del mismo formulario terminarían
 * separándose, y el día que se agregue una pregunta va a quedar en una sola.
 *
 * El orden de las preguntas no es casual. «¿Para qué lo vas a usar?» va
 * primero porque cambia el nombre de casi todo lo que viene abajo: un
 * comercio tiene rubro y un nombre de negocio, una cuenta personal no.
 */
export default function DatosDelNegocio({
  datos, alCambiar,
}: {
  datos: DatosRegistro;
  alCambiar: (parcial: Partial<DatosRegistro>) => void;
}) {
  const t = useTextos();
  const esPersonal = datos.tipoCuenta === 'personal';

  return (
    <div className="space-y-5">
      <div>
        <label className="etiqueta">{t.pantallas.paraQueLoVasAUsar}</label>
        <div className="mt-1 grid gap-2">
          <Eleccion
            activo={!esPersonal}
            onClick={() => alCambiar({ tipoCuenta: 'emprendedor' })}
            titulo={t.pantallas.paraMiNegocio}
            detalle={t.pantallas.paraMiNegocioDetalle}
            prueba={t.pantallas.diasPrueba(20)}
          />
          <Eleccion
            activo={esPersonal}
            onClick={() => alCambiar({ tipoCuenta: 'personal' })}
            titulo={t.pantallas.paraMi}
            detalle={t.pantallas.paraMiDetalle}
            prueba={t.pantallas.diasPrueba(14)}
          />
        </div>
      </div>

      <Separador />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="etiqueta" htmlFor="mi-nombre">{t.registro.nombreApellido}</label>
          <input
            id="mi-nombre" className="campo" maxLength={80} autoComplete="name"
            placeholder={t.registro.nombreApellidoEjemplo}
            value={datos.miNombre}
            onChange={(e) => alCambiar({ miNombre: e.target.value })}
          />
        </div>
        <div>
          <label className="etiqueta" htmlFor="telefono">{t.registro.telefono}</label>
          <input
            id="telefono" className="campo" maxLength={30} inputMode="tel" autoComplete="tel"
            placeholder={t.registro.telefonoEjemplo}
            value={datos.telefono}
            onChange={(e) => alCambiar({ telefono: e.target.value })}
          />
        </div>
      </div>
      <p className="-mt-2 text-[12.5px] leading-snug text-tinta/50">{t.registro.telefonoDetalle}</p>

      <Separador />

      <div>
        <label className="etiqueta" htmlFor="nombre">
          {esPersonal ? t.pantallas.poneleNombre : t.pantallas.nombreDelNegocio}
        </label>
        <input
          id="nombre" className="campo" required maxLength={60}
          placeholder={esPersonal ? t.pantallas.ejemploPersonal : t.pantallas.ejemploNegocio}
          value={datos.nombre}
          onChange={(e) => alCambiar({ nombre: e.target.value })}
        />
      </div>

      {!esPersonal && (
        <div>
          <label className="etiqueta" htmlFor="rubro">{t.pantallas.enQueAndas}</label>
          <select
            id="rubro" className="campo" value={datos.rubro}
            onChange={(e) => alCambiar({ rubro: e.target.value as Rubro })}
          >
            {LISTA_RUBROS.map((r) => (
              <option key={r.clave} value={r.clave}>{r.nombre}</option>
            ))}
          </select>
          <p className="mt-1.5 text-[12.5px] leading-snug text-tinta/50">
            {LISTA_RUBROS.find((r) => r.clave === datos.rubro)?.ejemplo}
            {'. '}
            {t.pantallas.rubroDetalle}
          </p>
        </div>
      )}

      <div>
        <label className="etiqueta" htmlFor="se-dedica">
          {t.registro.aQueTeDedicas}{' '}
          <span className="font-normal text-tinta/40">· {t.registro.opcional}</span>
        </label>
        <input
          id="se-dedica" className="campo" maxLength={120}
          placeholder={t.registro.aQueTeDedicasEjemplo}
          value={datos.seDedica}
          onChange={(e) => alCambiar({ seDedica: e.target.value })}
        />
      </div>

      <div>
        <label className="etiqueta" htmlFor="moneda">{t.pantallas.moneda}</label>
        <select
          id="moneda" className="campo" value={datos.moneda}
          onChange={(e) => alCambiar({ moneda: e.target.value })}
        >
          <option value="PYG">{t.pantallas.monedaPYG}</option>
          <option value="USD">{t.pantallas.monedaUSD}</option>
          <option value="ARS">{t.pantallas.monedaARS}</option>
          <option value="BRL">{t.pantallas.monedaBRL}</option>
          <option value="EUR">{t.pantallas.monedaEUR}</option>
        </select>
      </div>

      <Separador />

      <div>
        <label className="etiqueta" htmlFor="conocio">{t.pantallas.comoNosConociste}</label>
        <select
          id="conocio" className="campo" value={datos.comoNosConocio}
          onChange={(e) => alCambiar({ comoNosConocio: e.target.value })}
        >
          <option value="">{t.pantallas.prefieroNoDecir}</option>
          {CANALES.map((c) => <option key={c} value={c}>{c}</option>)}
          <option value="Un conocido">{t.pantallas.unConocido}</option>
          <option value="Otro">{t.captura.metodoOtro}</option>
        </select>
      </div>
    </div>
  );
}

function Separador() {
  return <hr className="border-borde" />;
}

/** Una de las dos formas de usar Orden, en la pantalla donde se elige. */
function Eleccion({
  activo, onClick, titulo, detalle, prueba,
}: {
  activo: boolean;
  onClick: () => void;
  titulo: string;
  detalle: string;
  prueba: string;
}) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={activo}
      className={`rounded-xl border p-3 text-left transition ${
        activo ? 'border-verde bg-verde-claro/40 ring-1 ring-verde/25' : 'border-borde hover:bg-arena'
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-[14.5px] font-bold">{titulo}</span>
        <span className={`pastilla shrink-0 ${activo ? 'bg-verde text-white' : 'bg-arena text-tinta/50'}`}>
          {prueba}
        </span>
      </span>
      <span className="mt-0.5 block text-[12.5px] leading-snug text-tinta/60">{detalle}</span>
    </button>
  );
}
