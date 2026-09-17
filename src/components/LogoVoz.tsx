'use client';

import { useEffect, useRef } from 'react';

/**
 * EL LOGO DE ORDEN QUE ESCUCHA.
 *
 * Primero fue una esfera de colores que giraba. Matías, al verla en el
 * iPhone: «no me parece muy lindo; debería ser algo que represente a Orden,
 * como el logo moviéndose». Esto es eso: el mismo anillo y el mismo palito
 * del ícono, vivos.
 *
 * CÓMO SE MUEVE
 *
 * Lee el volumen real del micrófono —el mismo flujo que se está grabando, no
 * se pide otro permiso— y con eso cada cuadro:
 *
 *   · el anillo se dibuja al abrir, como en la entrada de la app;
 *   · una luz recorre el anillo: lenta en silencio, rápida con la voz;
 *   · el palito del medio es el medidor: corto callado, largo al hablar;
 *   · salen ondas verdes del anillo, más seguidas y más fuertes con la voz.
 *
 * Sin flujo (mientras la IA interpreta) la luz gira pareja y el palito
 * respira: se ve que está pensando, no que se colgó.
 *
 * Todo por atributos que cambia `requestAnimationFrame` directo sobre el SVG,
 * sin pasar por el estado de React: a 60 cuadros por segundo, un render por
 * cuadro trabaría el teléfono justo mientras graba. Con «reducir movimiento»
 * no hay ondas ni giro; el palito sigue marcando la voz.
 */

const RADIO = 132;
const VUELTA = 2 * Math.PI * RADIO;
const ONDAS = 3;

export function LogoVoz({ flujo = null, tamano = 168 }: { flujo?: MediaStream | null; tamano?: number }) {
  const logo = useRef<SVGGElement>(null);
  const anillo = useRef<SVGCircleElement>(null);
  const luz = useRef<SVGGElement>(null);
  const palito = useRef<SVGLineElement>(null);
  const ondas = useRef<(SVGCircleElement | null)[]>([]);
  const brillo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let contexto: AudioContext | null = null;
    let analizador: AnalyserNode | null = null;
    let muestras: Uint8Array<ArrayBuffer> | null = null;

    if (flujo) {
      try {
        const Contexto = window.AudioContext || (window as any).webkitAudioContext;
        contexto = new Contexto();
        const fuente = contexto.createMediaStreamSource(flujo);
        analizador = contexto.createAnalyser();
        analizador.fftSize = 512;
        analizador.smoothingTimeConstant = 0.5;
        fuente.connect(analizador);
        muestras = new Uint8Array(new ArrayBuffer(analizador.fftSize));
      } catch {
        // Sin Web Audio el logo igual se mueve, solo que no sigue la voz.
        analizador = null;
      }
    }

    let nivel = 0;
    let giro = -90;
    let anterior = performance.now();
    const inicio = anterior;
    const fases = Array.from({ length: ONDAS }, (_, i) => i / ONDAS);
    let cuadro = 0;

    const dibujar = (ahora: number) => {
      const dt = Math.min(0.05, (ahora - anterior) / 1000);
      anterior = ahora;
      const t = (ahora - inicio) / 1000;

      let crudo = 0;
      if (analizador && muestras) {
        analizador.getByteTimeDomainData(muestras);
        let suma = 0;
        for (let i = 0; i < muestras.length; i++) {
          const v = (muestras[i] - 128) / 128;
          suma += v * v;
        }
        crudo = Math.min(1, Math.sqrt(suma / muestras.length) * 5);
      } else if (!flujo) {
        // Pensando: una respiración lenta, sin voz que seguir.
        crudo = 0.3 + Math.sin(t * 2.4) * 0.22;
      }

      // Sube rápido y baja despacio: si siguiera la voz sílaba por sílaba,
      // temblaría en vez de respirar.
      nivel += (crudo - nivel) * (crudo > nivel ? 0.45 : 0.08);

      // El anillo se dibuja en el primer medio segundo.
      const trazo = Math.min(1, t / 0.55);
      const suave = 1 - Math.pow(1 - trazo, 3);
      anillo.current?.setAttribute('stroke-dashoffset', (VUELTA * (1 - suave)).toFixed(1));
      anillo.current?.setAttribute('stroke-width', (46 + nivel * 10).toFixed(1));

      if (!reducido) {
        giro += dt * (flujo ? 70 + nivel * 520 : 300);
        luz.current?.setAttribute('transform', `rotate(${giro.toFixed(1)} 256 256)`);
      }
      if (luz.current) luz.current.style.opacity = (suave * (0.55 + nivel * 0.45)).toFixed(2);

      // El medidor: 64 callado, hasta 190 a toda voz (el anillo por dentro
      // mide 218; más largo tocaría el borde).
      const largo = 64 + nivel * 126;
      palito.current?.setAttribute('y1', (256 - largo / 2).toFixed(1));
      palito.current?.setAttribute('y2', (256 + largo / 2).toFixed(1));

      logo.current?.setAttribute('transform', `translate(256 256) scale(${(1 + nivel * 0.06).toFixed(3)}) translate(-256 -256)`);

      ondas.current.forEach((onda, i) => {
        if (!onda) return;
        if (reducido) { onda.style.opacity = '0'; return; }
        fases[i] = (fases[i] + dt * (flujo ? 0.35 + nivel * 1.3 : 0.4)) % 1;
        const p = fases[i];
        onda.setAttribute('r', (RADIO + 30 + p * 120).toFixed(1));
        onda.style.opacity = ((1 - p) * (1 - p) * (0.12 + nivel * 0.6) * suave).toFixed(3);
      });

      if (brillo.current) {
        brillo.current.style.opacity = (0.35 + nivel * 0.6).toFixed(2);
        brillo.current.style.transform = `scale(${(0.9 + nivel * 0.3).toFixed(3)})`;
      }

      cuadro = requestAnimationFrame(dibujar);
    };

    cuadro = requestAnimationFrame(dibujar);
    return () => {
      cancelAnimationFrame(cuadro);
      contexto?.close().catch(() => {});
    };
  }, [flujo]);

  return (
    <div className="relative mx-auto" style={{ width: tamano, height: tamano }} aria-hidden="true">
      <div
        ref={brillo}
        className="pointer-events-none absolute -inset-[30%] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(72,220,130,.42), rgba(72,220,130,.1) 42%, transparent 68%)', opacity: 0 }}
      />
      <svg viewBox="56 56 400 400" className="relative h-full w-full" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="logo-voz-verde" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7cf0a8" />
            <stop offset="55%" stopColor="#48dc82" />
            <stop offset="100%" stopColor="#1f9d57" />
          </linearGradient>
        </defs>

        {Array.from({ length: ONDAS }, (_, i) => (
          <circle
            key={i}
            ref={(el) => { ondas.current[i] = el; }}
            cx="256" cy="256" r={RADIO} fill="none" stroke="#48dc82" strokeWidth={6}
            style={{ opacity: 0 }}
          />
        ))}

        <g ref={logo}>
          <circle
            ref={anillo}
            cx="256" cy="256" r={RADIO} fill="none" stroke="url(#logo-voz-verde)" strokeWidth={46}
            strokeDasharray={VUELTA} strokeDashoffset={VUELTA} transform="rotate(-90 256 256)"
          />
          {/* La luz que recorre el anillo: un tramo claro con las puntas redondas. */}
          <g ref={luz} style={{ opacity: 0 }}>
            <circle
              cx="256" cy="256" r={RADIO} fill="none" stroke="#eafff1" strokeWidth={16} strokeLinecap="round"
              strokeDasharray={`${(VUELTA * 0.16).toFixed(1)} ${VUELTA.toFixed(1)}`}
            />
          </g>
          {/* El palito del logo, del color del texto: claro en oscuro, oscuro en claro. */}
          <line
            ref={palito}
            x1="256" x2="256" y1="224" y2="288" strokeWidth={26} strokeLinecap="round"
            style={{ stroke: 'rgb(var(--tinta))' }}
          />
        </g>
      </svg>
    </div>
  );
}
