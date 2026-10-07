import { Vacio } from '@/components/Piezas';
import type { Textos } from '@/i18n';
import type { PalabrasAlumnos } from '@/i18n/textos/reportes-alumnos';
import type { DesgloseDelCierre } from '@/lib/cierre-alumnos';

/**
 * LOS NÚMEROS DEL CIERRE DEL PROFE QUE VENDE PRODUCTOS (128).
 *
 * Los mismos tres del comercio —entró, salió, ganancia neta— con lo que su
 * día tiene distinto: lo que entró se abre en lo de sus clases y lo de sus
 * productos, que es la pregunta de Matías desde la 121 («¿cómo va a saber su
 * ganancia de eso?»), y lo que salió es todo lo que salió, como el «Gastado»
 * de su panel.
 *
 * LO QUE NO TIENE, A PROPÓSITO: la comparación con la semana pasada. Un
 * profe cobra el mes por adelantado: el día de cobro daría «900 % más» y
 * todos los demás «90 % menos», en rojo. Es retarlo por no cobrar todos los
 * días, lo mismo que la 090 le sacó. Y el día sin plata no le dice «todavía
 * no cargaste nada»: le dice que no entró ni salió plata, y si dio clases,
 * cuántas.
 *
 * Las cuentas viven en src/lib/cierre-alumnos.ts; acá solo se dibuja. Recibe
 * la plata ya escrita para que la página decida la moneda de la vista.
 */
export function NumerosCierreAlumnos({
  huboActividad, entro, salio, quedo, desglose, mercaderiaAparte, conCostoDeLoVendido, palabras, plata, t,
}: {
  huboActividad: boolean;
  entro: number;
  salio: number;
  /** Null para quien no ve la rentabilidad. */
  quedo: number | null;
  /** Null si no se pudo leer: salen los tres números sin abrir. */
  desglose: DesgloseDelCierre | null;
  /** La compra de mercadería que no restó entera (106). Cero si no hubo. */
  mercaderiaAparte: number;
  conCostoDeLoVendido: boolean;
  /** Las palabras del profe o del trainer: «clases» o «sesiones». */
  palabras: PalabrasAlumnos;
  plata: (n: number) => string;
  t: Textos;
}) {
  const vp = t.vendoProductos;

  if (!huboActividad) {
    const dadas = desglose?.clasesDadas ?? 0;
    return (
      <div className="tarjeta">
        <Vacio
          titulo={vp.cierre.sinPlata}
          detalle={dadas > 0
            ? `${vp.cierre.clasesDadas(dadas, palabras)} ${vp.cierre.sinPlataDetalle(palabras)}`
            : vp.cierre.sinPlataDetalle(palabras)}
        />
      </div>
    );
  }

  const ganancia = desglose?.gananciaProductos ?? null;
  return (
    <div className="tarjeta divide-y divide-borde">
      <FilaCierre etiqueta={t.cierre.entro} valor={plata(entro)} tono="bueno" />
      {/* De dónde vino lo que entró. Solo lo que no es cero: el cierre se
          lee en diez segundos. */}
      {desglose && desglose.clases > 0 && (
        // Sin «Diste N clases» debajo: lo cobrado y lo dado son dos cosas.
        // El día que cobra un paquete de ocho y da una clase se leía como
        // si esa clase hubiera valido todo el paquete. Las clases dadas se
        // dicen solo el día sin plata, donde no hay número con qué confundir.
        <DetalleCierre etiqueta={vp.panel.deTusClases(palabras)} valor={plata(desglose.clases)} />
      )}
      {desglose && desglose.productos > 0 && (
        <DetalleCierre
          etiqueta={vp.panel.deProductos}
          valor={plata(desglose.productos)}
          nota={ganancia === null ? undefined
            : ganancia >= 0 ? vp.cierre.teDejaron(plata(ganancia)) : vp.cierre.perdiste(plata(-ganancia))}
        />
      )}
      {desglose && desglose.otros > 0 && (
        <DetalleCierre etiqueta={vp.panel.otrosIngresos} valor={plata(desglose.otros)} />
      )}

      <FilaCierre etiqueta={t.cierre.salio} valor={plata(salio)} tono={salio > 0 ? 'malo' : 'neutro'} />
      {/* La misma nota de su panel: sin ella, entró menos salió no da la
          ganancia de abajo el día que compró mercadería. */}
      {mercaderiaAparte > 0 && quedo !== null && (
        <NotaCierre>{vp.panel.mercaderiaAparte(plata(mercaderiaAparte))}</NotaCierre>
      )}

      {quedo !== null && (
        <FilaCierre
          etiqueta={t.cierre.quedo}
          valor={plata(quedo)}
          tono={quedo >= 0 ? 'bueno' : 'malo'}
          destacado
        />
      )}
      {quedo !== null && conCostoDeLoVendido && (
        <NotaCierre>{vp.panel.teQuedaConProductos}</NotaCierre>
      )}
    </div>
  );
}

/** Uno de los tres números del cierre. La usan el comercio y el profe. */
export function FilaCierre({
  etiqueta, valor, tono = 'neutro', destacado = false,
}: {
  etiqueta: string;
  valor: string;
  tono?: 'neutro' | 'bueno' | 'malo';
  destacado?: boolean;
}) {
  const color = tono === 'bueno' ? 'text-verde-fuerte' : tono === 'malo' ? 'text-rojo' : 'text-tinta';
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3.5">
      <span className={`text-[14px] ${destacado ? 'font-bold text-tinta' : 'font-semibold text-tinta/55'}`}>
        {etiqueta}
      </span>
      <span className={`tabular-nums ${destacado ? 'text-[22px] font-titulo font-extrabold' : 'text-[17px] font-bold'} ${color}`}>
        {valor}
      </span>
    </div>
  );
}

/** Un renglón chico debajo de otro: aclara, no compite. */
export function DetalleCierre({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 bg-arena/40 px-4 py-2.5">
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-tinta/60">{etiqueta}</span>
        {nota && <span className="block text-[11.5px] text-tinta/40">{nota}</span>}
      </span>
      <span className="shrink-0 text-[14px] font-bold tabular-nums text-tinta/70">{valor}</span>
    </div>
  );
}

/** Una aclaración de un renglón, sin número: por qué la cuenta da lo que da. */
function NotaCierre({ children }: { children: React.ReactNode }) {
  return <p className="bg-arena/40 px-4 py-2.5 text-[12px] leading-snug text-tinta/50">{children}</p>;
}
