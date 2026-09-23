'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { enlaceWhatsApp, telefonoInternacional } from '@/lib/telefono';
import { useTextos } from '@/i18n/cliente';
import type { EnlaceRutina } from '@/lib/tipos-rutinas';
import { copiarTexto, linkDeRutina, primerNombre } from './panel/utiles';
import { MensajeError } from './panel/Piezas';

/**
 * El mensaje que acompaña el link: «Hola Ana, acá tenés tu rutina: …».
 *
 * Puro, y con la plantilla de afuera (del diccionario), para que Clientes,
 * la carpeta y la hoja de después de guardar digan exactamente lo mismo.
 * Va con el nombre de pila: el apellido en un saludo suena a trámite.
 */
export function mensajeDeRutina(
  plantilla: (nombre: string, link: string) => string,
  nombre: string,
  link: string,
): string {
  return plantilla(primerNombre(nombre), link);
}

type Estado = 'nada' | 'pidiendo' | 'listo' | 'apagado';

/**
 * MANDAR LA RUTINA (098): el link del cliente, por WhatsApp.
 *
 * Es un solo link por persona y no por rutina: el cliente guarda un mensaje
 * y siempre ve la vigente. Por eso casi siempre el token ya existe (se crea
 * cuando una rutina queda vigente) y el botón es un `<a href>` común: sin
 * nada que esperar antes de abrir, el Safari del iPhone no lo bloquea como
 * ventana emergente.
 *
 * Si todavía no hay token, se pide al tocar (`enlace_rutina`). Después de
 * esa espera algunos navegadores ya no dejan abrir otra pestaña: si no se
 * abre, el botón queda listo para un segundo toque, que siempre anda.
 *
 * Sin teléfono cargado no hay a quién escribirle: se comparte con el menú
 * del celular (el trainer elige el chat) y, si el navegador no lo tiene, se
 * copia el link.
 *
 * Un link apagado no se manda: el cliente vería «Este link ya no está
 * activo». Se ofrece prenderlo primero.
 *
 * Prender el link o crearlo cambia la base: después se refresca la página,
 * para que lo de alrededor (la tarjeta «Su link» de la carpeta, las
 * pastillas «Link apagado» de la lista) no siga diciendo lo de antes. El
 * botón sigue siendo un <a href> común: el refresco no lo toca.
 */
export function MandarRutina({
  empresaId, clienteId, nombre, telefono, zona, token, activo, variante = 'principal',
}: {
  empresaId: string;
  clienteId: string;
  /** El nombre como está en la ficha; el mensaje usa el de pila. */
  nombre: string;
  telefono: string;
  zona: string;
  /** El token del link, si ya se sabe. Sin él, se pide al tocar. */
  token?: string | null;
  /**
   * Si el link está prendido. Si llega el token sin esto, se toma como
   * prendido (así viene de `rutinas_de` y de guardar la rutina).
   */
  activo?: boolean;
  /** 'principal' (verde lleno), 'suave' o 'chica' (la de la ficha de Clientes, junto a WhatsApp). */
  variante?: 'principal' | 'suave' | 'chica';
}) {
  const t = useTextos();
  const m = t.rutinasPanel.mandar;
  const router = useRouter();

  const [tk, setTk] = useState<string | null>(token ?? null);
  const [prendido, setPrendido] = useState<boolean | null>(activo ?? (token ? true : null));
  const [origen, setOrigen] = useState('');
  const [estado, setEstado] = useState<Estado>('nada');
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');

  // El origen es el de donde está parado el trainer (producción, una vista
  // previa, el celular en la red de la casa). Solo existe en el navegador.
  useEffect(() => { setOrigen(window.location.origin); }, []);
  // Si afuera cambió el link («Cambiar el link»), manda el de afuera.
  useEffect(() => { if (token) setTk(token); }, [token]);
  useEffect(() => { if (activo !== undefined) setPrendido(activo); }, [activo]);

  const pila = primerNombre(nombre) || nombre;
  const conTelefono = telefonoInternacional(telefono ?? '', zona) !== '';
  const link = tk && origen ? linkDeRutina(origen, tk) : '';
  const mensaje = link ? mensajeDeRutina(m.mensaje, nombre, link) : '';
  const whatsapp = mensaje ? enlaceWhatsApp(telefono ?? '', zona, mensaje) : '';
  const directo = !!whatsapp && prendido === true;

  const etiqueta = conTelefono ? t.rutinasComun.acciones.mandarWhatsapp : m.compartir;
  const clase = variante === 'chica'
    ? 'inline-flex min-h-[44px] items-center justify-center rounded-xl border border-verde/40 px-3.5 text-[13.5px] font-semibold text-verde-fuerte hover:bg-verde-claro disabled:opacity-50'
    : `${variante === 'principal' ? 'boton-principal' : 'boton-suave'} min-h-[44px] w-full`;

  /** Sin teléfono: el menú de compartir del celular, o copiar el link. */
  async function compartir(texto: string, soloLink: string) {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text: texto });
        return;
      } catch (e) {
        // Cerró el menú sin elegir: no pasó nada, no hay que avisar.
        if ((e as { name?: string })?.name === 'AbortError') return;
      }
    }
    if (await copiarTexto(soloLink)) setAviso(m.copiado(pila));
    else setError(m.noSeCopio);
  }

  async function alTocar() {
    setError('');
    setAviso('');
    let token = tk;
    let esta = prendido;
    let espero = false;

    if (!token || esta === null) {
      setEstado('pidiendo');
      try {
        const { data, error: e } = await clienteNavegador()
          .rpc('enlace_rutina', { p_empresa: empresaId, p_cliente: clienteId });
        if (e) throw e;
        const en = data as EnlaceRutina | null;
        // Sin token no hay link que mandar: el mensaje genérico, y nada abierto.
        if (!en?.token) {
          setError(t.errores.generico);
          setEstado('nada');
          return;
        }
        token = en.token;
        esta = en.activo;
        setTk(token);
        setPrendido(esta);
        espero = true;
        // Si no había link, ahora hay: la carpeta tiene que dejar de decir «todavía no tiene».
        if (!tk) router.refresh();
      } catch (e) {
        setError(mensajeDeError(e, t.errores.generico));
        setEstado('nada');
        return;
      }
    }

    if (!esta) { setEstado('apagado'); return; }

    const url = linkDeRutina(window.location.origin, token);
    const texto = mensajeDeRutina(m.mensaje, nombre, url);
    const wa = enlaceWhatsApp(telefono ?? '', zona, texto);

    if (wa) {
      // Después de esperar, el navegador puede negarse: queda el botón listo.
      const ventana = window.open(wa, '_blank');
      if (ventana) {
        try { ventana.opener = null; } catch { /* otra pestaña: nada que cortar */ }
        setEstado('nada');
      } else {
        setEstado('listo');
      }
      return;
    }

    // Compartir o copiar también piden un toque reciente: si hubo espera,
    // se deja listo para el segundo toque en vez de fallar.
    if (espero) { setEstado('listo'); return; }
    setEstado('nada');
    await compartir(texto, url);
  }

  async function prender() {
    setError('');
    setEstado('pidiendo');
    try {
      const { error: e } = await clienteNavegador()
        .rpc('activar_enlace_rutina', { p_empresa: empresaId, p_cliente: clienteId, p_activo: true });
      if (e) throw e;
      setPrendido(true);
      setEstado('listo');
      router.refresh();
    } catch (e) {
      setError(mensajeDeError(e, t.errores.generico));
      setEstado('apagado');
    }
  }

  return (
    <div className={variante === 'chica' ? '' : 'w-full'}>
      {estado === 'apagado' ? (
        <div className="rounded-xl bg-ambar-claro px-3.5 py-3">
          <p className="text-[13.5px] font-medium leading-snug text-tinta/80">{m.apagado(pila)}</p>
          <button type="button" onClick={prender} className="boton-principal mt-2.5 min-h-[44px] w-full">
            {m.prender}
          </button>
        </div>
      ) : directo ? (
        <a
          href={whatsapp} target="_blank" rel="noopener noreferrer" className={clase}
          onClick={() => setEstado('nada')}
        >
          {estado === 'listo' ? m.abrirWhatsapp : etiqueta}
        </a>
      ) : (
        <button type="button" onClick={alTocar} disabled={estado === 'pidiendo'} className={clase}>
          {estado === 'pidiendo' ? m.preparando : etiqueta}
        </button>
      )}

      {estado === 'listo' && <p className="mt-1.5 text-[12.5px] text-tinta/55">{m.tocaDeNuevo}</p>}
      {aviso && <p role="status" className="mt-1.5 text-[12.5px] font-semibold text-verde-fuerte">✓ {aviso}</p>}
      <MensajeError texto={error} />
    </div>
  );
}
