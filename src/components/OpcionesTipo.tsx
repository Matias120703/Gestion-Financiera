'use client';

import { useTextos } from '@/i18n/cliente';
import type { TipoCuenta } from '@/lib/tipos';

/**
 * Las opciones de «Qué es», iguales en todas las revisiones de la captura.
 *
 * Si la IA se equivocó de tipo, se cambia acá y se pasa a la revisión que
 * corresponde. Eran listas escritas a mano en cada pantalla, y cada tipo
 * nuevo había que acordarse de sumarlo en todas.
 *
 * Una cuenta personal no vende, ni tiene catálogo ni clientes. «Turno» no
 * está: un turno se revisa en la agenda, no acá.
 */
export function OpcionesTipo({ tipoCuenta }: { tipoCuenta: TipoCuenta }) {
  const t = useTextos();
  const personal = tipoCuenta === 'personal';
  return (
    <>
      {!personal && <option value="venta">{t.captura.tipoVenta}</option>}
      <option value="gasto">{t.captura.tipoGasto}</option>
      <option value="ingreso">{personal ? t.captura.tipoIngreso : t.captura.tipoOtroIngreso}</option>
      <option value="deuda">{t.captura.tipoDeuda}</option>
      <option value="pago_deuda">{t.captura.tipoPagoDeuda}</option>
      <option value="fiado">{personal ? t.captura.tipoMeDeben : t.captura.tipoFiado}</option>
      <option value="cobro_fiado">{t.captura.tipoCobroFiado}</option>
      {!personal && <option value="producto">{t.captura.tipoProducto}</option>}
      {!personal && <option value="cliente">{t.captura.tipoCliente}</option>}
    </>
  );
}
