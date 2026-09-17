'use client';

import { useEffect, useRef } from 'react';

/**
 * LA IA QUE ESCUCHA.
 *
 * Del cuaderno de Matías: «al registrar con voz, que aparezca un diseño como
 * de IA, y que se mueva al hablar». Antes era un círculo rojo con un
 * micrófono que latía igual hablaras o no: no se notaba que la app estaba
 * escuchando, y el rojo parecía un error.
 *
 * CÓMO SE MUEVE
 *
 * Lee el volumen real del micrófono —el mismo flujo que se está grabando,
 * no se pide otro permiso— y con eso cada cuadro:
 *
 *   · crece un poco cuando hablás y vuelve despacio cuando te callás;
 *   · gira: lento en silencio, rápido con la voz;
 *   · cambia de forma: una esfera quieta en silencio, una gota viva al hablar.
 *
 * Todo por estilos que cambia `requestAnimationFrame` directo sobre los
 * elementos, sin pasar por el estado de React: a 60 cuadros por segundo, un
 * render por cuadro trabaría el teléfono justo mientras graba.
 *
 * Sin flujo (mientras la IA interpreta) se mueve solo, suave: sigue viva.
 * Con «reducir movimiento» encendido en el teléfono, no gira ni se deforma.
 */
export function OrbeVoz({ flujo = null, tamano = 168 }: { flujo?: MediaStream | null; tamano?: number }) {
  const caja = useRef<HTMLDivElement>(null);
  const forma = useRef<HTMLDivElement>(null);
  const capaA = useRef<HTMLDivElement>(null);
  const capaB = useRef<HTMLDivElement>(null);
  const halo = useRef<HTMLDivElement>(null);

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
        // Sin Web Audio la esfera igual se mueve, solo que no sigue la voz.
        analizador = null;
      }
    }

    let nivel = 0;
    let giroA = 0;
    let giroB = 0;
    let cuadro = 0;
    const inicio = performance.now();

    const dibujar = (ahora: number) => {
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
        crudo = 0.18 + Math.sin((ahora - inicio) / 480) * 0.12;
      }

      // Sube rápido y baja despacio: si siguiera la voz sílaba por sílaba,
      // temblaría en vez de respirar.
      nivel += (crudo - nivel) * (crudo > nivel ? 0.4 : 0.07);

      const t = (ahora - inicio) / 1000;
      if (!reducido) {
        giroA += 0.4 + nivel * 7;
        giroB -= 0.3 + nivel * 5;
      }

      const amplitud = reducido ? 0 : 5 + nivel * 18;
      const veloc = 1.2 + nivel * 3.5;
      const r = (fase: number) => (50 + Math.sin(t * veloc + fase) * amplitud).toFixed(1);
      const radio = `${r(0)}% ${r(1.7)}% ${r(3.1)}% ${r(4.4)}% / ${r(2.2)}% ${r(0.6)}% ${r(5.1)}% ${r(3.8)}%`;

      if (caja.current) caja.current.style.transform = `scale(${(1 + nivel * (reducido ? 0.06 : 0.2)).toFixed(3)})`;
      if (forma.current) forma.current.style.borderRadius = radio;
      if (capaA.current) capaA.current.style.transform = `rotate(${giroA.toFixed(1)}deg)`;
      if (capaB.current) capaB.current.style.transform = `rotate(${giroB.toFixed(1)}deg)`;
      if (halo.current) {
        halo.current.style.opacity = (0.35 + nivel * 0.55).toFixed(2);
        halo.current.style.transform = `scale(${(1 + nivel * 0.35).toFixed(3)})`;
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
        ref={halo}
        className="absolute -inset-[22%] rounded-full blur-2xl"
        style={{ background: 'radial-gradient(circle, rgba(61,220,154,.6), rgba(34,211,238,.28) 45%, rgba(167,139,250,.12) 60%, transparent 72%)' }}
      />
      <div ref={caja} className="relative h-full w-full will-change-transform">
        <div
          ref={forma}
          className="absolute inset-0 overflow-hidden shadow-[0_18px_40px_-14px_rgba(23,121,90,.55)]"
          // `isolation` y la máscara son para Safari: sin eso, al girar las
          // capas de adentro se salen de la forma redondeada en el iPhone.
          style={{ borderRadius: '50%', isolation: 'isolate', WebkitMaskImage: '-webkit-radial-gradient(white, black)' }}
        >
          <div
            ref={capaA}
            className="absolute -inset-[35%] will-change-transform"
            style={{ background: 'conic-gradient(from 0deg, #3ddc9a, #22d3ee, #6366f1, #c084fc, #f472b6, #3ddc9a)' }}
          />
          <div
            ref={capaB}
            className="absolute -inset-[35%] opacity-80 mix-blend-screen will-change-transform"
            style={{ background: 'conic-gradient(from 150deg, #17795a, #3ddc9a, #a78bfa, #22d3ee, #17795a)', filter: 'blur(16px)' }}
          />
          {/* El volumen: luz arriba a la izquierda y sombra abajo, como una esfera. */}
          <div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(circle at 32% 26%, rgba(255,255,255,.8), rgba(255,255,255,0) 36%), radial-gradient(circle at 72% 80%, rgba(8,24,40,.35), transparent 58%)' }}
          />
        </div>
      </div>
    </div>
  );
}
