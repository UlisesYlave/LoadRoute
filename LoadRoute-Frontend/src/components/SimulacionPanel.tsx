import React from 'react';
import { IconRefresh } from '@/components/icons'; // Ajusta la ruta de tus íconos si es necesario

interface SimulacionPanelProps {
  umbralVerde: number;
  umbralAmbar: number;
  onUmbralVerde: (v: number) => void;
  onUmbralAmbar: (v: number) => void;
  onReiniciar: () => void;
  escenario: number;
  diasSimulados: number;
  realElapsedMs: number;
  isOwner?: boolean;
}

export default function SimulacionPanel({
  umbralVerde,
  umbralAmbar,
  onUmbralVerde,
  onUmbralAmbar,
  onReiniciar,
  escenario,
  realElapsedMs,
  isOwner = true
}: SimulacionPanelProps) {
  const buttonText = escenario === 2 
    ? 'Detener escenario de operaciones día a día' 
    : 'Cargar nuevos datos';

  const tooltip = isOwner 
    ? "" 
    : "No eres el creador de esta simulación, no puedes detenerla.";

  return (
    <div className="flex flex-col h-full p-4 space-y-5 overflow-y-auto custom-scrollbar">
      {/* Umbral de Capacidad */}
      <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-4 backdrop-blur-sm">
        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-3">
          Umbral de Capacidad
        </p>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
            <div className="flex-1">
              <div className="flex justify-between text-[10px] text-slate-200 mb-1">
                <span>Verde</span><span>0–{umbralVerde}%</span>
              </div>
              <input 
                type="range" 
                min={1} 
                max={umbralAmbar - 5} 
                value={umbralVerde}
                onChange={e => onUmbralVerde(Number(e.target.value))}
                className="w-full h-1 cursor-pointer accent-emerald-500" 
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0 shadow-[0_0_6px_rgba(245,158,11,0.6)]" />
            <div className="flex-1">
              <div className="flex justify-between text-[10px] text-slate-200 mb-1">
                <span>Ámbar</span><span>{umbralVerde + 1}–{umbralAmbar}%</span>
              </div>
              <input 
                type="range" 
                min={umbralVerde + 5} 
                max={95} 
                value={umbralAmbar}
                onChange={e => onUmbralAmbar(Number(e.target.value))}
                className="w-full h-1 cursor-pointer accent-amber-500" 
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 shadow-[0_0_6px_rgba(239,68,68,0.6)]" />
            <span className="text-[10px] text-slate-200">Rojo — {umbralAmbar + 1}–100%</span>
          </div>
        </div>
      </div>

      {escenario !== 2 && (
        <>
          <div className="border-t border-slate-700/50" />
          <button
            onClick={onReiniciar}
            disabled={!isOwner}
            title={tooltip}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg border text-sm transition-all
                       ${isOwner 
                         ? 'border-slate-600/50 text-slate-200 hover:text-slate-100 hover:bg-slate-700/50 hover:border-slate-500 cursor-pointer' 
                         : 'border-slate-800 text-slate-500 bg-slate-900/20 cursor-not-allowed opacity-50'}`}
          >
            <IconRefresh size={16} /> {buttonText}
          </button>
        </>
      )}
    </div>
  );
}