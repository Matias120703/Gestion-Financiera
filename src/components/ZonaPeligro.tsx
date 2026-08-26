'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { useTextos } from '@/i18n/cliente';
import { mensajeDeError } from '@/lib/errores';

/**
 * LA ZONA DELICADA
 *
 * Dos acciones irreversibles, con la misma regla de diseño: **la confirmación
 * es escribir algo, no tocar «Aceptar»**. Un cuadro de "¿estás seguro?" se
 * toca sin leer; escribir el nombre del negocio, no.
 *
 * Y ninguna de las dos aparece de entrada: hay que abrir la sección. Un botón
 * rojo suelto en Ajustes es un botón que alguien va a tocar por curiosidad.
 */
export function ZonaPeligro({
  empresaId, nombreEmpresa, esPropietario,
}: {
  empresaId: string;
  nombreEmpresa: string;
  esPropietario: boolean;
}) {
  const t = useTextos();
  const [abierta, setAbierta] = useState(false);

  if (!abierta) {
    return (
      <div className="px-4 pb-4 pt-3">
        <button
          type="button"
          onClick={() => setAbierta(true)}
          className="boton-texto text-tinta/45"
        >
          {t.zonaPeligro.titulo}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 px-4 pb-5 pt-3">
      <p className="text-[13px] leading-relaxed text-tinta/55">{t.zonaPeligro.detalle}</p>

      <VaciarNegocio
        empresaId={empresaId}
        nombreEmpresa={nombreEmpresa}
        esPropietario={esPropietario}
      />

      <div className="border-t border-borde pt-5">
        <BorrarCuenta />
      </div>
    </div>
  );
}

/** Empezar de cero: el negocio queda, los datos no. */
function VaciarNegocio({
  empresaId, nombreEmpresa, esPropietario,
}: {
  empresaId: string;
  nombreEmpresa: string;
  esPropietario: boolean;
}) {
  const t = useTextos();
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  const puede = texto.trim() === nombreEmpresa;

  async function vaciar() {
    setTrabajando(true);
    setError('');
    setMensaje('');
    try {
      const supabase = clienteNavegador();
      const { data, error: e } = await supabase.rpc('vaciar_empresa', {
        p_empresa: empresaId,
        p_confirmacion: texto.trim(),
      });
      if (e) throw e;

      // Storage no se vacía solo: la función devuelve las rutas que quedaron
      // sin dueño. Si esto falla, no se deshace nada — los datos ya no están
      // y lo único que queda son archivos que nadie puede ver.
      const rutas: string[] = Array.isArray(data?.archivos) ? data.archivos : [];
      if (rutas.length > 0) {
        await supabase.storage.from('comprobantes').remove(rutas).catch(() => null);
      }

      setMensaje(t.zonaPeligro.vaciarListo(Number(data?.movimientos ?? 0)));
      setTexto('');
      router.refresh();
    } catch (e: any) {
      setError(mensajeDeError(e, t.errores.generico));
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <div>
      <h3 className="text-[15px] font-bold tracking-tight">{t.zonaPeligro.vaciarTitulo}</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-tinta/55">{t.zonaPeligro.vaciarDetalle}</p>

      {!esPropietario ? (
        <p className="mt-2 text-[12.5px] font-semibold text-tinta/40">
          {t.zonaPeligro.soloPropietarioVaciar}
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          <label className="block">
            <span className="etiqueta">{t.zonaPeligro.vaciarPide(nombreEmpresa)}</span>
            <input
              className="campo"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={nombreEmpresa}
              autoComplete="off"
            />
          </label>

          <button
            type="button"
            onClick={vaciar}
            disabled={!puede || trabajando}
            className="boton-peligro w-full"
          >
            {trabajando ? t.comun.guardando : t.zonaPeligro.vaciarBoton}
          </button>
        </div>
      )}

      {mensaje && <p className="mt-2 text-[13px] font-semibold text-verde-fuerte">{mensaje}</p>}
      {error && (
        <p className="mt-2 rounded-xl bg-rojo-claro px-3 py-2 text-[13px] font-medium text-rojo">{error}</p>
      )}
    </div>
  );
}

/** Borrar la cuenta entera. */
function BorrarCuenta() {
  const t = useTextos();
  const router = useRouter();
  // 'cargando' | 'error' | el resumen ya traído.
  const [estado, setEstado] = useState<'cargando' | 'error' | any>('cargando');
  const [texto, setTexto] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState('');

  /**
   * El resumen se pide al abrir, no al confirmar: nadie tiene que escribir
   * BORRAR para recién ahí enterarse de qué está por perder.
   *
   * UN SOLO ESTADO CON TRES VALORES, y no dos booleanos coordinados:
   *   · 'cargando' → todavía no llegó
   *   · 'error'    → la consulta falló, hay que decirlo
   *   · un objeto  → llegó
   *
   * Con dos estados separados («resumen» + «falló») hay una combinación que
   * no debería existir —los dos en falso— y es justo la que deja la pantalla
   * en «Cargando…» para siempre si algo se desincroniza. Con uno solo, ese
   * estado imposible no se puede representar.
   */
  useEffect(() => {
    let vivo = true;

    // Con `await` dentro de try/catch y no con `.then().catch()`: lo que
    // devuelve `supabase.rpc()` es un «thenable», no una Promise de verdad,
    // así que encadenarle `.catch()` no está garantizado. Con `await`, un
    // fallo de red cae en el catch de siempre y no hay ambigüedad.
    (async () => {
      try {
        const supabase = clienteNavegador();
        const { data, error: e } = await supabase.rpc('resumen_borrado_cuenta');
        if (!vivo) return;
        setEstado(e || data == null ? 'error' : data);
      } catch {
        if (vivo) setEstado('error');
      }
    })();

    return () => { vivo = false; };
  }, []);

  const listo = estado !== 'cargando' && estado !== 'error';
  const bloqueadas: any[] = listo ? (estado.bloqueadas ?? []) : [];
  const seBorran: any[] = listo ? (estado.se_borran ?? []) : [];
  const meVoyDe: any[] = listo ? (estado.me_voy_de ?? []) : [];
  const puede = texto.trim().toUpperCase() === 'BORRAR' && bloqueadas.length === 0;

  async function borrar() {
    setTrabajando(true);
    setError('');
    try {
      const r = await fetch('/api/cuenta/borrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmacion: texto.trim() }),
      });
      const datos = await r.json();
      if (!r.ok) throw new Error(datos?.error ?? t.errores.generico);

      // La cuenta ya no existe: una navegación normal del navegador, no del
      // enrutador, para que no quede ningún estado viejo en memoria.
      window.location.href = '/ingresar';
    } catch (e: any) {
      setError(e?.message ?? t.errores.generico);
      setTrabajando(false);
    }
  }

  return (
    <div>
      <h3 className="text-[15px] font-bold tracking-tight text-rojo">{t.zonaPeligro.borrarTitulo}</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-tinta/55">{t.zonaPeligro.borrarDetalle}</p>

      {estado === 'error' ? (
        <p className="mt-3 rounded-xl bg-ambar-claro px-3 py-2.5 text-[13px] font-medium leading-relaxed text-ambar">
          {t.errores.generico}
        </p>
      ) : estado === 'cargando' ? (
        <p className="mt-3 text-[13px] text-tinta/40">{t.comun.cargando}</p>
      ) : (
        <div className="mt-3 space-y-3">
          {bloqueadas.length > 0 && (
            <div className="rounded-xl bg-ambar-claro px-3.5 py-3">
              <p className="text-[13px] font-semibold leading-relaxed text-ambar">
                {t.zonaPeligro.bloqueadas}
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {bloqueadas.map((b) => (
                  <li key={b.nombre} className="text-[12.5px] font-semibold text-tinta/60">
                    {b.nombre} · {t.plan.personas(b.gente)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {seBorran.length > 0 && (
            <div className="rounded-xl bg-rojo-claro px-3.5 py-3">
              <p className="text-[12.5px] font-bold text-rojo">{t.zonaPeligro.seBorran}</p>
              <ul className="mt-1 space-y-0.5">
                {seBorran.map((e) => (
                  <li key={e.nombre} className="text-[13px] font-semibold text-tinta/70">
                    {e.nombre}
                  </li>
                ))}
              </ul>
              {Number(estado.movimientos_que_se_pierden) > 0 && (
                <p className="mt-1.5 text-[12px] font-semibold text-rojo">
                  {t.zonaPeligro.movimientosQueSePierden(Number(estado.movimientos_que_se_pierden))}
                </p>
              )}
            </div>
          )}

          {meVoyDe.length > 0 && (
            <div className="rounded-xl bg-arena px-3.5 py-3">
              <p className="text-[12.5px] font-bold text-tinta/60">{t.zonaPeligro.meVoyDe}</p>
              <ul className="mt-1 space-y-0.5">
                {meVoyDe.map((e) => (
                  <li key={e.nombre} className="text-[13px] font-semibold text-tinta/70">{e.nombre}</li>
                ))}
              </ul>
            </div>
          )}

          {bloqueadas.length === 0 && (
            <>
              <label className="block">
                <span className="etiqueta">{t.zonaPeligro.borrarPide}</span>
                <input
                  className="campo"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="BORRAR"
                  autoComplete="off"
                />
              </label>

              <button
                type="button"
                onClick={borrar}
                disabled={!puede || trabajando}
                className="boton-peligro w-full"
              >
                {trabajando ? t.comun.guardando : t.zonaPeligro.borrarBoton}
              </button>
            </>
          )}
        </div>
      )}

      {error && (
        <p className="mt-2 rounded-xl bg-rojo-claro px-3 py-2 text-[13px] font-medium text-rojo">{error}</p>
      )}
    </div>
  );
}
