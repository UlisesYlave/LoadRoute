import React, { useState, useEffect } from 'react';
import { TramoDTO } from '@/types/rutas';

interface SidebarVuelosProps {
  vuelos: TramoDTO[];
  cancelacionesPorDia: number[][];
  simDia: number;
  maxDia: number;
}

export default function SidebarVuelos({ vuelos, cancelacionesPorDia, simDia, maxDia }: SidebarVuelosProps) {
  const [selectedDia, setSelectedDia] = useState<number>(simDia);
  const [searchTerm, setSearchTerm] = useState('');

  // Sincronizar selectedDia con simDia cuando avanza la simulación
  useEffect(() => {
    setSelectedDia(Math.min(simDia, maxDia));
  }, [simDia, maxDia]);

  const cancelacionesActivas = new Set(cancelacionesPorDia[selectedDia] || []);

  const filtered = vuelos.filter(v => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      v.vueloId.toString().includes(q) ||
      v.origen.toLowerCase().includes(q) ||
      v.destino.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 bg-[#0f1f3d] border-b border-slate-700/50 shrink-0">
        <div className="flex justify-between items-center mb-2">
          <p className="text-xs font-semibold text-orange-400 uppercase tracking-wider">
            Vuelos de la Red
          </p>
          <select 
            value={selectedDia}
            onChange={e => setSelectedDia(Number(e.target.value))}
            className="bg-slate-800 text-slate-200 text-xs border border-slate-700 rounded px-2 py-1 outline-none"
          >
            {Array.from({ length: maxDia + 1 }).map((_, i) => (
              <option key={i} value={i}>Día {i + 1}</option>
            ))}
          </select>
        </div>
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">🔍</span>
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar por ID, origen o destino..."
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg pl-7 pr-3 py-2
                       text-xs text-slate-200 placeholder-slate-500
                       focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20"
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 mt-2 px-1">
          <span>{filtered.length} programados</span>
          {cancelacionesActivas.size > 0 && (
            <span className="text-red-400 font-bold">{cancelacionesActivas.size} cancelados</span>
          )}
        </div>
      </div>
      
      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
        {filtered.slice(0, 100).map(v => {
          const isCancelled = cancelacionesActivas.has(v.vueloId);
          return (
            <div key={v.vueloId} className={`border rounded-lg p-3 transition-colors ${isCancelled ? 'bg-red-950/20 border-red-900/50' : 'bg-[#122340] border-slate-700/50 hover:bg-[#162a4d]'}`}>
              <div className="flex justify-between items-start mb-2">
                <span className={`font-mono text-sm font-bold ${isCancelled ? 'text-red-300' : 'text-slate-200'}`}>
                  Vuelo #{v.vueloId}
                </span>
                {isCancelled ? (
                  <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-[10px] rounded border border-red-500/30 font-semibold uppercase tracking-wider">
                    Cancelado
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] rounded border border-emerald-500/20 uppercase tracking-wider">
                    Realizado
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
                <span className={isCancelled ? 'text-red-300/70' : 'text-orange-300'}>{v.origen}</span>
                <span className="text-slate-500">→</span>
                <span className={isCancelled ? 'text-red-300/70' : 'text-orange-300'}>{v.destino}</span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 mt-2">
                <span>Sale: {v.horaSalidaLocal}</span>
                <span>Llega: {v.horaLlegadaLocal}</span>
              </div>
            </div>
          );
        })}
        {filtered.length > 100 && (
          <p className="text-center text-[10px] text-slate-500 py-2">
            Mostrando 100 de {filtered.length}. Usa el buscador para filtrar.
          </p>
        )}
        {filtered.length === 0 && (
          <p className="text-center text-xs text-slate-500 py-8">
            No se encontraron vuelos.
          </p>
        )}
      </div>
    </div>
  );
}
