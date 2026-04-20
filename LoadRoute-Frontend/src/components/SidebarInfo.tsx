import React from 'react';
import { RutaMuestra, AeropuertoDTO } from '@/types/rutas';

interface SidebarInfoProps {
  envios: RutaMuestra[];
  aeropuertos: AeropuertoDTO[];
  onSelectEnvio: (e: RutaMuestra) => void;
  onSelectAeropuerto: (a: AeropuertoDTO) => void;
}

export default function SidebarInfo({ envios, aeropuertos, onSelectEnvio, onSelectAeropuerto }: SidebarInfoProps) {
  const [tab, setTab] = React.useState<'envios' | 'aeropuertos'>('envios');

  return (
    <div className="flex flex-col h-full bg-[#0c1a30] text-sm overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-slate-700/50 bg-[#0f1f3d]">
        <button
          onClick={() => setTab('envios')}
          className={`flex-1 py-3 text-center font-semibold text-xs tracking-wider uppercase transition-colors
            ${tab === 'envios' ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/10' : 'text-slate-500 hover:text-slate-300'}
          `}
        >
          Envíos ({envios.length})
        </button>
        <button
          onClick={() => setTab('aeropuertos')}
          className={`flex-1 py-3 text-center font-semibold text-xs tracking-wider uppercase transition-colors
            ${tab === 'aeropuertos' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/10' : 'text-slate-500 hover:text-slate-300'}
          `}
        >
          Aeropuertos ({aeropuertos.length})
        </button>
      </div>

      {/* Lists */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
        {tab === 'envios' && (
          envios.map(e => (
            <div 
              key={e.envioId}
              onClick={() => onSelectEnvio(e)}
              className="bg-[#122340] border border-slate-700/50 rounded-lg p-3 cursor-pointer hover:border-blue-500/50 hover:bg-[#162a4d] transition-all"
            >
              <div className="flex justify-between items-center mb-1">
                <span className="font-mono text-xs text-blue-400">{e.envioId}</span>
                <span className="bg-slate-800 text-[10px] px-2 py-0.5 rounded text-slate-400">{e.maletas} maletas</span>
              </div>
              <div className="flex items-center gap-2 mt-2 text-xs font-mono text-slate-300">
                <span>{e.origen}</span>
                <span className="text-slate-500 text-[10px]">→</span>
                <span>{e.destino}</span>
              </div>
            </div>
          ))
        )}

        {tab === 'aeropuertos' && (
          aeropuertos.map(a => (
            <div 
              key={a.codigo}
              onClick={() => onSelectAeropuerto(a)}
              className="bg-[#122340] border border-slate-700/50 rounded-lg p-3 cursor-pointer hover:border-emerald-500/50 hover:bg-[#162a4d] transition-all"
            >
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-slate-200">{a.codigo}</span>
                <span className="text-[10px] text-slate-400">{a.pais} - {a.ciudad}</span>
              </div>
              <div className="mt-2 text-xs">
                <p className="text-slate-400">Capacidad Máxima: <span className="text-emerald-400">{a.capacidadMax}</span></p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
