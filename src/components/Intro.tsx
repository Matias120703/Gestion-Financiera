/**
 * LA ENTRADA A ORDEN.
 *
 * Del cuaderno de Matías: «al entrar a la app, que no te pegue directo con el
 * panel: que aparezca el logo de Orden y al lado Orden · Tu gestión
 * financiera».
 *
 * CUÁNDO APARECE
 *
 * Una vez por sesión: al abrir la app, no cada vez que se cambia de pantalla
 * ni cada vez que se recarga para ver un número nuevo. Quien abre Orden diez
 * veces por día no puede esperar una animación diez veces.
 *
 * POR QUÉ NO ES UN COMPONENTE CON ESTADO
 *
 * Si la decisión «¿ya la vio?» esperara a React, el panel se pintaría primero
 * y la intro aparecería encima un instante después: un parpadeo, que es
 * justo lo contrario de una entrada. Como el tema (lib/tema.ts), la decide un
 * guion chico que corre antes de pintar: si en esta sesión ya se vio, marca
 * el <html> y la hoja de estilos no la dibuja.
 *
 * Y se va sola por CSS (globals.css, `.intro`): no depende de que cargue
 * JavaScript para dejar entrar a nadie.
 */
const GUION_INTRO = `(function(){try{
var d=document.documentElement;
if(sessionStorage.getItem('orden-intro')){d.classList.add('intro-vista');}
else{sessionStorage.setItem('orden-intro','1');}
}catch(e){document.documentElement.classList.add('intro-vista');}})();`;

export function Intro({ lema }: { lema: string }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: GUION_INTRO }} />
      <div className="intro" aria-hidden="true">
        <div className="intro-luz" />
        <div className="relative flex items-center gap-4">
          <svg viewBox="0 0 512 512" className="intro-marca h-[68px] w-[68px]">
            <circle
              className="intro-anillo" cx="256" cy="256" r="132" fill="none"
              stroke="#3ddc9a" strokeWidth={46} strokeLinecap="round"
            />
            <path className="intro-palo" d="M256 190v132" strokeWidth={26} strokeLinecap="round" stroke="#ffffff" />
          </svg>
          <div className="text-left">
            <p className="intro-nombre text-[34px] font-bold leading-none tracking-tight text-white">Orden</p>
            <p className="intro-lema mt-1.5 text-[12.5px] font-semibold uppercase tracking-[0.18em] text-menta/80">
              {lema}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
