import React, { useState, useRef, useEffect } from 'react';
import { RutaMuestra, TramoDTO } from '@/types/rutas';

function absToHHMM(absMinutos: number): string {
    const minutosDia = ((Math.floor(absMinutos) % 1440) + 1440) % 1440;
    const h = Math.floor(minutosDia / 60);
    const m = minutosDia % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} GMT`;
}

function getFechaLocalFromAbs(minutos: number, fechaInicioRaw: string): string {
    if (!fechaInicioRaw || fechaInicioRaw.length < 8) return '';
    const y = parseInt(fechaInicioRaw.slice(0, 4));
    const m = parseInt(fechaInicioRaw.slice(4, 6)) - 1;
    const d = parseInt(fechaInicioRaw.slice(6, 8));
    const date = new Date(Date.UTC(y, m, d)); 
    date.setUTCMinutes(date.getUTCMinutes() + minutos);
    const yy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `${dd}/${mm}/${yy}`;
}

interface ModalVueloProps {
  vuelo: TramoDTO | null;
  rutasActivas: RutaMuestra[];
  onClose: () => void;
  fechaInicioRaw: string;
}

export default function ModalVuelo({ vuelo, rutasActivas, onClose, fechaInicioRaw }: ModalVueloProps) {
  const [position, setPosition] = useState({ x: 20, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    // Posicionar el modal a la derecha por defecto al abrir
    if (typeof window !== 'undefined') {
      setPosition({ x: Math.max(20, window.innerWidth - 420), y: 80 });
    }
  }, [vuelo?.vueloId]);

  if (!vuelo) return null;

  // Calcular ocupación actual 
  const cargaActual = rutasActivas
    .filter(r => r.tramos && r.tramos.some(t => t.vueloId === vuelo.vueloId))
    .reduce((sum, r) => sum + r.maletas, 0);

  const porcentaje = Math.min((cargaActual / Math.max(vuelo.capacidad, 1)) * 100, 100).toFixed(1);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Solo permitir arrastrar si se hace clic en el área del header (evitar botones)
    if ((e.target as HTMLElement).closest('button')) return;
    
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div
      className="fixed z-[10000] bg-[#0f1f3d]/95 backdrop-blur-md border border-slate-700 shadow-2xl w-full max-w-sm rounded-xl overflow-hidden animate-in fade-in zoom-in duration-200"
      style={{ left: position.x, top: position.y, touchAction: 'none' }}
    >
        {/* Header Draggable */}
        <div 
          className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between bg-black/40 cursor-move select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
              <span className="text-xl">✈️</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white leading-tight">Vuelo #{vuelo.vueloId}</h3>
              <p className="text-[11px] font-semibold text-emerald-400 tracking-wider">
                {vuelo.origen} → {vuelo.destino}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-700/50 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
            
          {/* Horarios */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3 text-center">
              <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Despegue</p>
              <p className="text-xl font-mono text-slate-200">{absToHHMM(vuelo.salidaAbsMinutos)}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{getFechaLocalFromAbs(vuelo.salidaAbsMinutos, fechaInicioRaw)} • {vuelo.horaSalidaLocal} Local</p>
            </div>
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3 text-center">
              <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Aterrizaje</p>
              <p className="text-xl font-mono text-slate-200">{absToHHMM(vuelo.llegadaAbsMinutos)}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{getFechaLocalFromAbs(vuelo.llegadaAbsMinutos, fechaInicioRaw)} • {vuelo.horaLlegadaLocal} Local</p>
            </div>
          </div>
          
          {/* Capacidad en Vivo */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3">
            <div className="flex justify-between items-end mb-2">
              <div>
                 <p className="text-[10px] text-slate-400 uppercase tracking-widest">Ocupación Actual</p>
                 <p className="text-lg font-bold text-white">
                   {cargaActual} <span className="text-sm font-normal text-slate-500">/ {vuelo.capacidad} maletas</span>
                 </p>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                  cargaActual > vuelo.capacidad ? 'bg-red-500/20 text-red-400' :
                  cargaActual > vuelo.capacidad * 0.8 ? 'bg-amber-500/20 text-amber-400' :
                  'bg-emerald-500/20 text-emerald-400'
               }`}>
                 {porcentaje}%
              </span>
            </div>
            {/* ProgressBar */}
            <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
               <div 
                 className={`h-full transition-all duration-500 ${
                    cargaActual > vuelo.capacidad ? 'bg-red-500' :
                    cargaActual > vuelo.capacidad * 0.8 ? 'bg-amber-500' :
                    'bg-emerald-500'
                 }`} 
                 style={{ width: `${porcentaje}%` }}
               />
            </div>
          </div>
          
          {/* Estado Informativo */}
          <div className="flex gap-2 text-xs text-slate-400 bg-blue-500/10 border border-blue-500/20 rounded p-3">
            <span className="text-blue-400">ℹ️</span>
            Este avión se encuentra actualmente prestando servicio logístico animado.
          </div>
        </div>
    </div>
  );
}
