import { AeropuertoDTO, RutaMuestra } from '@/types/rutas';

interface ModalAeropuertoProps {
  aeropuerto: AeropuertoDTO | null;
  rutasActivas?: RutaMuestra[];
  simTiempoMinutos?: number;
  onClose: () => void;
}

export default function ModalAeropuerto({ aeropuerto, rutasActivas, simTiempoMinutos, onClose }: ModalAeropuertoProps) {
  if (!aeropuerto) return null;

  // Calculo de carga actual dinámica
  let cargaActual = 0;
  if (rutasActivas && simTiempoMinutos !== undefined) {
    for (const r of rutasActivas) {
      if (!r.tramos || r.tramos.length === 0) continue;
      const firstFlight = r.tramos[0];
      const lastFlight = r.tramos[r.tramos.length - 1];

      if (aeropuerto.codigo === r.origen) {
         if (simTiempoMinutos <= firstFlight.salidaMinutosGMT) {
            cargaActual += r.maletas;
         }
      }
      
      /* 
         NOTA: Según requerimiento, los paquetes en su destino final NO se acumulan en el recinto.
         Solo ocupan espacio en el Origen y en los aeropuertos de Escala.
      */

      for (let i = 0; i < r.tramos.length - 1; i++) {
         const arrFlight = r.tramos[i];
         const depFlight = r.tramos[i+1];
         if (aeropuerto.codigo === arrFlight.destino) {
            if (simTiempoMinutos >= arrFlight.llegadaMinutosGMT && simTiempoMinutos <= depFlight.salidaMinutosGMT) {
                cargaActual += r.maletas;
            } else if (arrFlight.llegadaMinutosGMT > depFlight.salidaMinutosGMT) {
                if (simTiempoMinutos >= arrFlight.llegadaMinutosGMT || simTiempoMinutos <= depFlight.salidaMinutosGMT) {
                    cargaActual += r.maletas;
                }
            }
         }
      }
    }
  }

  const porcentaje = Math.min((cargaActual / Math.max(aeropuerto.capacidadMax, 1)) * 100, 100).toFixed(1);

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0f1f3d] border border-slate-700 rounded-xl shadow-2xl w-full max-w-sm animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🏢</span>
            <div>
              <h2 className="text-lg font-bold text-slate-100">{aeropuerto.codigo}</h2>
              <p className="text-xs text-slate-400">{aeropuerto.ciudad}, {aeropuerto.pais}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-700/50 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Barra de Capacidad en Vivo */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3">
            <div className="flex justify-between items-end mb-2">
              <div>
                 <p className="text-[10px] text-slate-400 uppercase tracking-widest">Ocupación Recinto</p>
                 <p className="text-lg font-bold text-white">
                   {cargaActual} <span className="text-sm font-normal text-slate-500">/ {aeropuerto.capacidadMax} maletas</span>
                 </p>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                  cargaActual > aeropuerto.capacidadMax ? 'bg-red-500/20 text-red-400' :
                  cargaActual > aeropuerto.capacidadMax * 0.8 ? 'bg-amber-500/20 text-amber-400' :
                  'bg-emerald-500/20 text-emerald-400'
               }`}>
                 {porcentaje}%
              </span>
            </div>
            {/* ProgressBar */}
            <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
               <div 
                 className={`h-full transition-all duration-500 ${
                    cargaActual > aeropuerto.capacidadMax ? 'bg-red-500' :
                    cargaActual > aeropuerto.capacidadMax * 0.8 ? 'bg-amber-500' :
                    'bg-emerald-500'
                 }`} 
                 style={{ width: `${porcentaje}%` }}
               />
            </div>
          </div>
          <div className="bg-slate-800/40 rounded-lg p-4 border border-slate-700/50 text-sm">
            <div className="flex justify-between items-center py-2 border-b border-slate-700/50">
              <span className="text-slate-400">Continente</span>
              <span className="text-slate-200 capitalize">{aeropuerto.continente.replace('_', ' ')}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-700/50">
              <span className="text-slate-400">Zona Horaria</span>
              <span className="text-slate-200 font-mono">GMT{aeropuerto.gmt >= 0 ? '+' : ''}{aeropuerto.gmt}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-slate-400">Capacidad Máxima</span>
              <span className="text-emerald-400 font-bold">{aeropuerto.capacidadMax} maletas</span>
            </div>
          </div>
          <p className="text-xs text-slate-500 text-center italic mt-2">
            La ocupación exacta de paquetes varía cada minuto durante la simulación según los vuelos activos.
          </p>
        </div>
      </div>
    </div>
  );
}
