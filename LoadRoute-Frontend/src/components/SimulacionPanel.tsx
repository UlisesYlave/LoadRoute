import React from 'react';
import { IconRefresh } from '@/components/icons';

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
  
  // Nuevas propiedades
  statsFlotaActiva: { pct: number; carga: number; capacidad: number; vuelosActivos: number };
  statsAlmacenes: { pct: number; carga: number; capacidad: number };
}

function getSemaforoColors(pct: number, verde: number, ambar: number) {
  if (pct <= verde) {
    return {
      text: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/20',
      progressBg: 'bg-gradient-to-r from-emerald-500 to-teal-500',
      dot: 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]'
    };
  }
  if (pct <= ambar) {
    return {
      text: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/20',
      progressBg: 'bg-gradient-to-r from-amber-500 to-orange-500',
      dot: 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)]'
    };
  }
  return {
    text: 'text-red-400',
    bg: 'bg-red-500/10 border-red-500/20',
    progressBg: 'bg-gradient-to-r from-red-500 to-pink-500',
    dot: 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]'
  };
}

export default function SimulacionPanel({
  umbralVerde,
  umbralAmbar,
  onUmbralVerde,
  onUmbralAmbar,
  onReiniciar,
  escenario,
  realElapsedMs,
  isOwner = true,
  statsFlotaActiva,
  statsAlmacenes
}: SimulacionPanelProps) {
  const buttonText = escenario === 2 
    ? 'Detener escenario de operaciones día a día' 
    : 'Cargar nuevos datos';

  const tooltip = isOwner 
    ? "" 
    : "No eres el creador de esta simulación, no puedes detenerla.";

  const colorsAlmacenes = getSemaforoColors(statsAlmacenes.pct, umbralVerde, umbralAmbar);
  const colorsFlota = getSemaforoColors(statsFlotaActiva.pct, umbralVerde, umbralAmbar);

  return (
    <div className="flex flex-col h-full p-4 space-y-5 overflow-y-auto custom-scrollbar">
      {/* Ocupación de Almacenes en Conjunto */}
      <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-4 backdrop-blur-sm">
        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-3">
          Ocupación Global de Almacenes
        </p>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className={`text-2xl font-bold font-mono ${colorsAlmacenes.text}`}>
                {statsAlmacenes.pct.toFixed(1)}%
              </span>
              <span className="text-[10px] text-slate-400">ocupado</span>
            </div>
            <div className={`w-2 h-2 rounded-full ${colorsAlmacenes.dot}`} />
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-950/60">
            <div
              className={`h-full rounded-full ${colorsAlmacenes.progressBg} transition-all duration-500`}
              style={{ width: `${Math.min(statsAlmacenes.pct, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>{statsAlmacenes.carga.toLocaleString()} / {statsAlmacenes.capacidad.toLocaleString()} maletas</span>
          </div>
        </div>
      </div>

      {/* Ocupación de Flota Activa */}
      <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-4 backdrop-blur-sm">
        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-3">
          Ocupación de Flota (Vuelos en el Aire)
        </p>
        {statsFlotaActiva.vuelosActivos > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-1.5">
                <span className={`text-2xl font-bold font-mono ${colorsFlota.text}`}>
                  {statsFlotaActiva.pct.toFixed(1)}%
                </span>
                <span className="text-[10px] text-slate-400">llenado</span>
              </div>
              <div className={`w-2 h-2 rounded-full ${colorsFlota.dot}`} />
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-950/60">
              <div
                className={`h-full rounded-full ${colorsFlota.progressBg} transition-all duration-500`}
                style={{ width: `${Math.min(statsFlotaActiva.pct, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>{statsFlotaActiva.carga.toLocaleString()} / {statsFlotaActiva.capacidad.toLocaleString()} maletas</span>
              <span className="font-semibold text-slate-500">{statsFlotaActiva.vuelosActivos} {statsFlotaActiva.vuelosActivos === 1 ? 'vuelo' : 'vuelos'}</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col py-1 justify-center">
            <span className="text-sm font-semibold text-slate-400">Sin vuelos activos</span>
            <span className="text-[9px] text-slate-500 mt-0.5">La flota está en tierra en este momento.</span>
          </div>
        )}
      </div>

      {/* Umbral de Capacidad */}
      <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-4 backdrop-blur-sm">
        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-3">
          Umbrales de Alerta
        </p>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
            <div className="flex-1">
              <div className="flex justify-between text-[10px] text-slate-200 mb-1">
                <span>Verde (Seguro)</span><span>0–{umbralVerde}%</span>
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
                <span>Ámbar (Advertencia)</span><span>{umbralVerde + 1}–{umbralAmbar}%</span>
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
            <span className="text-[10px] text-slate-200">Rojo (Crítico) — {umbralAmbar + 1}–100%</span>
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