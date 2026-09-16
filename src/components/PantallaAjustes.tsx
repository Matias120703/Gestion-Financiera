'use client';

import { useState } from 'react';
import { useTextos } from '@/i18n/cliente';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import type { Empresa } from '@/lib/tipos';
import { mensajeDeError, verificarAfectados } from '@/lib/errores';

export function EditorEmpresa({ empresa, puedeEditar }: { empresa: Empresa; puedeEditar: boolean }) {
  const t = useTextos();
  const router = useRouter();
  const [nombre, setNombre] = useState(empresa.nombre);
  const [moneda, setMoneda] = useState(empresa.moneda);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  const cambió = nombre.trim() !== empresa.nombre || moneda !== empresa.moneda;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setMensaje('');
    if (nombre.trim().length < 2) { setError(t.ajustes.nombreMuyCorto); return; }
    setGuardando(true);
    try {
      const supabase = clienteNavegador();
      const { data, error } = await supabase
        .from('empresas')
        .update({ nombre: nombre.trim(), moneda })
        .eq('id', empresa.id)
        .select('id');
      if (error) throw error;
      verificarAfectados(data, t.ajustes.soloAdminDatos);
      setMensaje(t.ajustes.guardadoPunto);
      router.refresh();
      setTimeout(() => setMensaje(''), 3000);
    } catch (e: any) {
      setError(mensajeDeError(e, t.gastos.noSePudoGuardar));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-3">
      <label className="block">
        <span className="etiqueta">{t.pantallas.nombreDelNegocio}</span>
        <input className="campo" maxLength={60} disabled={!puedeEditar} value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </label>

      <label className="block">
        <span className="etiqueta">{t.pantallas.moneda}</span>
        <select className="campo" disabled={!puedeEditar} value={moneda} onChange={(e) => setMoneda(e.target.value)}>
          <option value="PYG">{t.pantallas.monedaPYG}</option>
          <option value="USD">{t.pantallas.monedaUSD}</option>
          <option value="ARS">{t.pantallas.monedaARS}</option>
          <option value="BRL">{t.pantallas.monedaBRL}</option>
          <option value="EUR">{t.pantallas.monedaEUR}</option>
        </select>
        <span className="mt-1 block text-[12px] text-tinta/45">
          {t.ajustes.monedaNoSeCambia}
        </span>
      </label>

      {error && <p className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}
      {mensaje && <p className="rounded-xl bg-verde-claro px-3 py-2.5 text-[13px] font-semibold text-verde-fuerte">✓ {mensaje}</p>}

      {puedeEditar && (
        <button className="boton-principal w-full py-2.5" disabled={guardando || !cambió}>
          {guardando ? t.comun.guardando : t.ajustes.guardarCambios}
        </button>
      )}
    </form>
  );
}

export function CodigoEquipo({ codigo }: { codigo: string }) {
  const t = useTextos();
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div>
      <p className="text-[13.5px] leading-relaxed text-tinta/60">
        {t.ajustes.pasaleElCodigo}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 rounded-xl border border-borde bg-arena px-4 py-3 text-center text-[20px] font-bold tracking-[.25em]">
          {codigo}
        </code>
        <button type="button" className="boton-suave h-[50px] shrink-0" onClick={copiar}>
          {copiado ? t.ajustes.copiado : t.ajustes.copiar}
        </button>
      </div>
      <p className="mt-2.5 text-[12.5px] text-tinta/45">
        {t.ajustes.comoSeUne}
      </p>
    </div>
  );
}
