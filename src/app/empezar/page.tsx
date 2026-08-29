'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { COOKIE_EMPRESA } from '@/lib/constantes';
import { LISTA_RUBROS } from '@/lib/rubros';
import { useTextos } from '@/i18n/cliente';
import type { Rubro } from '@/lib/tipos';

export default function PaginaEmpezar() {
  const router = useRouter();
  const t = useTextos();
  const [pestania, setPestania] = useState<'crear' | 'unirme'>('crear');
  /**
   * Qué tipo de cuenta se está creando.
   *
   * Es la decisión más importante de esta pantalla y por eso se pregunta
   * PRIMERO, antes que el nombre. De acá cuelgan el largo de la prueba, el
   * precio, y qué pantallas van a existir: un comercio ve ventas y productos,
   * una cuenta personal no.
   *
   * Se puede cambiar después —no se pierde nada— pero elegir bien de entrada
   * evita que alguien pruebe el sistema equivocado y concluya que no le sirve.
   */
  const [tipoCuenta, setTipoCuenta] = useState<'emprendedor' | 'personal'>('emprendedor');
  /**
   * En qué anda el negocio.
   *
   * Solo se pregunta si es cuenta de negocio: alguien que lleva sus finanzas
   * personales no tiene rubro. De acá cuelgan las categorías que la IA le va
   * a sugerir y qué pantallas existen — un ganadero no tiene cierre del día
   * porque su ganancia no se mide por día.
   *
   * Se puede cambiar después en Ajustes sin perder nada.
   */
  const [rubro, setRubro] = useState<Rubro>('comercio');
  /**
   * De dónde salió esta persona.
   *
   * Se pregunta acá y no se deduce después: en el momento la respuesta es
   * honesta, reconstruida de memoria un mes más tarde no vale nada. Y es la
   * única forma de saber qué canal trae clientes de verdad antes de gastar
   * en publicidad.
   *
   * Opcional a propósito. Una pregunta obligatoria en el registro es una
   * puerta más que cruzar, y este dato no vale una cuenta perdida.
   */
  const [comoNosConocio, setComoNosConocio] = useState('');
  const [nombre, setNombre] = useState('');
  const [moneda, setMoneda] = useState('PYG');
  const [codigo, setCodigo] = useState('');
  const [miNombre, setMiNombre] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  function activar(empresaId: string) {
    document.cookie = `${COOKIE_EMPRESA}=${empresaId}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.push('/panel');
    router.refresh();
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const supabase = clienteNavegador();
      const { data, error } = await supabase.rpc('crear_empresa', {
        p_nombre: nombre.trim(),
        p_moneda: moneda,
        p_nombre_usuario: miNombre.trim() || null,
        // La zona del navegador. Decide qué día es "hoy" para el cierre y la
        // racha: un negocio en São Paulo con la hora de Asunción vería el
        // cierre del día equivocado durante una hora todas las noches. Si el
        // navegador no la sabe, la base pone Asunción y se corrige en Ajustes.
        p_zona: zonaDelNavegador(),
        p_tipo_cuenta: tipoCuenta,
        p_rubro: tipoCuenta === 'personal' ? 'comercio' : rubro,
        p_como_nos_conocio: comoNosConocio,
      });
      if (error) throw error;
      activar(data as string);
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo crear la empresa.');
      setCargando(false);
    }
  }

  async function unirme(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const supabase = clienteNavegador();
      const { data, error } = await supabase.rpc('unirse_empresa', {
        p_codigo: codigo.trim().toUpperCase(),
        p_nombre_usuario: miNombre.trim() || null,
      });
      if (error) throw error;
      activar(data as string);
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo unir a la empresa.');
      setCargando(false);
    }
  }

  async function salir() {
    const supabase = clienteNavegador();
    await supabase.auth.signOut();
    router.push('/ingresar');
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-tinta px-4 py-10">
      <div className="w-full max-w-[440px] aparecer">
        <div className="mb-7 flex items-center gap-2.5 text-white">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-verde text-lg font-black">o</span>
          <span className="text-lg font-bold tracking-tight">orden</span>
        </div>

        <div className="tarjeta p-6">
          <p className="titulo-seccion">{t.pantallas.primerPaso}</p>
          <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-tight">{t.pantallas.empecemos}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-tinta/60">
            {t.pantallas.creaTuCuenta}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-arena p-1">
            {(['crear', 'unirme'] as const).map((p) => (
              <button
                key={p} type="button"
                onClick={() => { setPestania(p); setError(''); }}
                className={`rounded-lg py-2 text-sm font-semibold transition ${
                  pestania === p ? 'bg-white text-tinta shadow-sm' : 'text-tinta/55'
                }`}
              >
                {p === 'crear' ? t.pantallas.crearEmpresa : t.pantallas.unirmeConCodigo}
              </button>
            ))}
          </div>

          {pestania === 'crear' ? (
            <form onSubmit={crear} className="mt-5 space-y-4">
              <div>
                <label className="etiqueta">{t.pantallas.paraQueLoVasAUsar}</label>
                <div className="mt-1 grid gap-2">
                  <Eleccion
                    activo={tipoCuenta === 'emprendedor'}
                    onClick={() => setTipoCuenta('emprendedor')}
                    titulo={t.pantallas.paraMiNegocio}
                    detalle={t.pantallas.paraMiNegocioDetalle}
                    prueba={t.pantallas.diasPrueba(20)}
                  />
                  <Eleccion
                    activo={tipoCuenta === 'personal'}
                    onClick={() => setTipoCuenta('personal')}
                    titulo={t.pantallas.paraMi}
                    detalle={t.pantallas.paraMiDetalle}
                    prueba={t.pantallas.diasPrueba(14)}
                  />
                </div>
              </div>

              {tipoCuenta !== 'personal' && (
                <div>
                  <label className="etiqueta" htmlFor="rubro">{t.pantallas.enQueAndas}</label>
                  <select
                    id="rubro" className="campo" value={rubro}
                    onChange={(e) => setRubro(e.target.value as Rubro)}
                  >
                    {LISTA_RUBROS.map((r) => (
                      <option key={r.clave} value={r.clave}>{r.nombre}</option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-[12.5px] leading-snug text-tinta/50">
                    {LISTA_RUBROS.find((r) => r.clave === rubro)?.ejemplo}
                    {'. '}
                    {t.pantallas.rubroDetalle}
                  </p>
                </div>
              )}

              <div>
                <label className="etiqueta" htmlFor="nombre">
                  {tipoCuenta === 'personal' ? t.pantallas.poneleNombre : t.pantallas.nombreDelNegocio}
                </label>
                <input id="nombre" className="campo" required maxLength={60}
                  placeholder={tipoCuenta === 'personal' ? t.pantallas.ejemploPersonal : t.pantallas.ejemploNegocio}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)} />
              </div>
              <div>
                <label className="etiqueta" htmlFor="moneda">{t.pantallas.moneda}</label>
                <select id="moneda" className="campo" value={moneda} onChange={(e) => setMoneda(e.target.value)}>
                  <option value="PYG">{t.pantallas.monedaPYG}</option>
                  <option value="USD">{t.pantallas.monedaUSD}</option>
                  <option value="ARS">{t.pantallas.monedaARS}</option>
                  <option value="BRL">{t.pantallas.monedaBRL}</option>
                  <option value="EUR">{t.pantallas.monedaEUR}</option>
                </select>
              </div>
              <div>
                <label className="etiqueta" htmlFor="conocio">{t.pantallas.comoNosConociste}</label>
                <select
                  id="conocio" className="campo" value={comoNosConocio}
                  onChange={(e) => setComoNosConocio(e.target.value)}
                >
                  <option value="">{t.pantallas.prefieroNoDecir}</option>
                  <option value="TikTok">TikTok</option>
                  <option value="Instagram">Instagram</option>
                  <option value="Facebook">Facebook</option>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Un conocido">{t.pantallas.unConocido}</option>
                  <option value="Google">Google</option>
                  <option value="Otro">{t.captura.metodoOtro}</option>
                </select>
              </div>

              <div>
                <label className="etiqueta" htmlFor="mi-nombre">{t.pantallas.tuNombre}</label>
                <input id="mi-nombre" className="campo" maxLength={40}
                  placeholder={tipoCuenta === 'personal' ? t.pantallas.comoTeLlamamos : t.pantallas.comoTeVen}
                  value={miNombre} onChange={(e) => setMiNombre(e.target.value)} />
              </div>
              {error && <p role="alert" className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}
              <button className="boton-principal w-full py-3" disabled={cargando}>
                {cargando ? 'Creando…' : 'Crear y empezar'}
              </button>
            </form>
          ) : (
            <form onSubmit={unirme} className="mt-5 space-y-4">
              <div>
                <label className="etiqueta" htmlFor="codigo">{t.pantallas.codigoEmpresa}</label>
                <input id="codigo" className="campo font-mono uppercase tracking-widest" required maxLength={12}
                  placeholder="A7F2K9P1"  /* un código, no un texto: no se traduce */ autoCapitalize="characters" value={codigo}
                  onChange={(e) => setCodigo(e.target.value.toUpperCase())} />
              </div>
              <div>
                <label className="etiqueta" htmlFor="mi-nombre-2">{t.pantallas.tuNombre}</label>
                <input id="mi-nombre-2" className="campo" maxLength={40} placeholder={t.pantallas.quienCargo}
                  value={miNombre} onChange={(e) => setMiNombre(e.target.value)} />
              </div>
              {error && <p role="alert" className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}
              <button className="boton-principal w-full py-3" disabled={cargando}>
                {cargando ? 'Entrando…' : 'Unirme'}
              </button>
            </form>
          )}

          <button type="button" onClick={salir} className="mt-5 w-full text-center text-[13px] font-semibold text-tinta/45 hover:text-tinta">
            {t.pantallas.cerrarSesion}
          </button>
        </div>
      </div>
    </main>
  );
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

/**
 * La zona horaria que informa el navegador, o Asunción si no la sabe.
 *
 * Se manda al crear la empresa. La persona la puede corregir después en
 * Ajustes; esto solo evita que el 99% de los casos tengan que hacerlo.
 */
function zonaDelNavegador(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Asuncion';
  } catch {
    return 'America/Asuncion';
  }
}
