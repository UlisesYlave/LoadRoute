import React from 'react';
import { RutaMuestra } from '@/types/rutas';

interface ModalEnvioProps {
  envio: RutaMuestra | null;
  onClose: () => void;
}

export default function ModalEnvio({ envio, onClose }: ModalEnvioProps) {
  if (!envio) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0f1f3d] border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-slate-700/50">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Plan de vuelo del envío</h2>
            <p className="text-sm font-mono text-blue-400 mt-1">{envio.envioId}</p>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-700/50 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-6">
          {envio.tramos.length === 0 ? (
            <p className="text-center text-slate-400 py-4">No hay ruta asignada para este envío.</p>
          ) : (
            envio.tramos.map((tramo, i) => (
              <div key={i} className="relative pl-6">
                {/* Timeline connector */}
                {i < envio.tramos.length - 1 && (
                  <div className="absolute left-[7px] top-6 bottom-[-24px] w-px bg-slate-700" />
                )}
                {/* Timeline bullet */}
                <div className="absolute left-0 top-1 w-[15px] h-[15px] bg-blue-500 rounded-full ring-4 ring-[#0f1f3d]" />

                <div className="bg-slate-800/40 rounded-lg p-4 border border-slate-700/50">
                  <h3 className="text-sm font-semibold text-slate-200 mb-2">
                    Vuelo #{tramo.vueloId}
                  </h3>
                  <div className="grid grid-cols-2 gap-y-3 text-xs">
                    <div>
                      <p className="text-slate-500">Aeropuerto de salida:</p>
                      <p className="font-mono text-slate-300">{tramo.origen}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Hora de salida Local:</p>
                      <p className="font-mono text-slate-300">{tramo.horaSalidaLocal}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Aeropuerto de llegada:</p>
                      <p className="font-mono text-slate-300">{tramo.destino}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Hora de llegada Local:</p>
                      <p className="font-mono text-slate-300">{tramo.horaLlegadaLocal}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
