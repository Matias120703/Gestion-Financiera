'use client';

/**
 * La zona horaria del negocio, en el navegador.
 *
 * POR QUÉ NO ALCANZA CON LA ZONA DEL TELÉFONO
 *
 * Un negocio en Encarnación cuyo dueño está de viaje en Madrid sigue cerrando
 * el día en Paraguay. El día que importa es el DEL NEGOCIO, no el del aparato
 * desde el que se mira — por eso la base guarda `empresas.zona_horaria` desde
 * la migración 008 y no se deduce nada de `Intl`.
 *
 * POR QUÉ UN CONTEXTO Y NO UNA PROP
 *
 * La necesitan siete componentes sueltos —el formulario de gastos, el de
 * ventas, el de ingresos, el de ahorro, la captura por voz, el editor del
 * reto— que no comparten padre. Pasarla por props obligaría a atravesar media
 * aplicación con un dato que nadie más usa, y el día que se agregue el octavo
 * se va a olvidar y va a volver a resolver «hoy» en Asunción.
 *
 * Es el mismo camino que ya hace el idioma: el servidor lo sabe, lo baja por
 * el layout y el resto lo lee de acá.
 */
import { createContext, useContext } from 'react';
import { ZONA } from './fechas';

const Contexto = createContext<string>(ZONA);

export function ProveedorZona({
  zona, children,
}: {
  zona: string;
  children: React.ReactNode;
}) {
  return <Contexto.Provider value={zona || ZONA}>{children}</Contexto.Provider>;
}

/**
 * La zona del negocio activo.
 *
 * El valor por defecto es Asunción, igual que en la base: si algo se renderiza
 * fuera del proveedor, el comportamiento es el de antes y no una fecha vacía.
 */
export function useZona(): string {
  return useContext(Contexto);
}
