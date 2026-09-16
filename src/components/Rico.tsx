/**
 * Un texto del diccionario con **negrita** y _cursiva_.
 *
 * El énfasis va adentro de la frase y no partido en pedazos: en portugués
 * la palabra resaltada no cae en el mismo lugar que en español, y una frase
 * armada en tres trozos se traduce mal o no se traduce.
 *
 * Sin estado ni efectos: sirve igual en páginas de servidor y en
 * componentes del navegador.
 */
export function Rico({ texto, negrita = '' }: { texto: string; negrita?: string }) {
  const partes = texto.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
  return (
    <>
      {partes.map((parte, i) => {
        if (parte.startsWith('**') && parte.endsWith('**') && parte.length > 4) {
          return <strong key={i} className={negrita}>{parte.slice(2, -2)}</strong>;
        }
        if (parte.startsWith('_') && parte.endsWith('_') && parte.length > 2) {
          return <em key={i}>{parte.slice(1, -1)}</em>;
        }
        return parte;
      })}
    </>
  );
}
