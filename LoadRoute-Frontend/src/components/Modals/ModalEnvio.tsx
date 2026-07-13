import { RutaMuestra } from '@/types/rutas';
import { IconClose, IconPackage, IconMap } from '@/components/icons'; // 👈 Se agregó IconMap
import { useDraggable } from '@/hooks/useDraggable';

interface ModalEnvioProps {
  envio: RutaMuestra | null;
  onClose: () => void;
  offsetRight?: boolean;
  fechaInicioRaw?: string;
  onEnfocarPedido: (pedido: any) => void; // 👈 Prop agregada
}

function formatGmtMinute(minutos?: number): string {
  if (minutos === undefined) return 'N/D';
  const total = ((Math.floor(minutos) % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60).toString().padStart(2, '0');
  const m = (total % 60).toString().padStart(2, '0');
  return `${h}:${m} GMT`;
}

function getFechaLocalDate(fechaInicioRaw: string, diaOffset: number): string {
  if (!fechaInicioRaw || fechaInicioRaw.length < 8) return '';
  const y = parseInt(fechaInicioRaw.slice(0, 4));
  const m = parseInt(fechaInicioRaw.slice(4, 6)) - 1;
  const d = parseInt(fechaInicioRaw.slice(6, 8));
  const date = new Date(Date.UTC(y, m, d));
  date.setDate(date.getDate() + diaOffset);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function ModalEnvio({ envio, onClose, offsetRight, fechaInicioRaw, onEnfocarPedido }: ModalEnvioProps) {
  const initialX = offsetRight ? 380 : 64;
  const initialY = 64;
  const { position, onMouseDown } = useDraggable(initialX, initialY, !!envio);

  if (!envio) return null;

  return (
    <div
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      className="fixed z-[10000] w-[340px] max-w-[calc(100vw-5rem)] max-h-[calc(100vh-5rem)] flex flex-col bg-[#0f1f3d]/95 border border-slate-700 rounded-lg shadow-2xl animate-in fade-in slide-in-from-left-2 duration-200"
    >
      <div 
        onMouseDown={onMouseDown}
        className="px-3 py-2.5 border-b border-slate-700/50 flex items-center justify-between bg-black/15 rounded-t-lg shrink-0 cursor-grab active:cursor-grabbing select-none"
      >
        <div className="flex items-center gap-2.5 min-w-0 pointer-events-none">
          <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
            <IconPackage size={16} className="text-blue-300" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-white leading-tight truncate">Envío</h3>
            <p className="text-[11px] font-mono font-semibold text-blue-300 tracking-wide truncate">
              {envio.envioId}
            </p>
          </div>
        </div>
        
        {/* Contenedor de botones de acción */}
        <div className="flex items-center gap-1.5">
          {/* 👇 Botón para enfocar pedido agregado */}
          <button
            onClick={() => onEnfocarPedido(envio)}
            className="w-7 h-7 rounded-full hover:bg-slate-700/50 flex items-center justify-center text-cyan-400 hover:text-cyan-300 transition-colors shrink-0"
            title="Enfocar en mapa"
            aria-label="Enfocar envío en mapa"
          >
            <IconMap size={16} />
          </button>
          
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full hover:bg-slate-700/50 flex items-center justify-center text-slate-400 hover:text-white transition-colors shrink-0"
            aria-label="Cerrar modal de envio"
          >
            <IconClose size={16} />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3 overflow-y-auto custom-scrollbar flex-1 min-h-0">
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-md p-2.5">
          <p className="text-[9px] text-slate-400 uppercase tracking-widest mb-1">Ruta del envio</p>
          <p className="text-base font-bold text-white">
            {envio.origen} <span className="text-slate-500">-&gt;</span> {envio.destino}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {envio.tramos.length} {envio.tramos.length === 1 ? 'tramo' : 'tramos'} asignados
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-md p-2 text-center">
            <p className="text-[9px] text-slate-400 uppercase tracking-widest mb-0.5">Maletas</p>
            <p className="text-base font-bold text-slate-200">{envio.maletas}</p>
          </div>
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-md p-2 text-center">
            <p className="text-[9px] text-slate-400 uppercase tracking-widest mb-0.5">SLA</p>
            <p className="text-base font-bold text-slate-200">{envio.slaHoras}h</p>
          </div>
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-md p-2 text-center">
            <p className="text-[9px] text-slate-400 uppercase tracking-widest mb-0.5">Recep. (GMT)</p>
            <p className="text-[11px] font-mono font-semibold text-slate-200 leading-tight">
              {formatGmtMinute(envio.recepcionMinutosGMT)}
            </p>
            <p className="text-[9px] text-blue-300 font-semibold mt-0.5">
              {getFechaLocalDate(fechaInicioRaw || '', envio.recepcionDiaOffset ?? 0)}
            </p>
          </div>
        </div>

        <div className="bg-slate-800/40 border border-slate-700/50 rounded-md overflow-hidden">
          <div className="px-2.5 py-2 border-b border-slate-700/50 flex items-center justify-between gap-3">
            <p className="text-[9px] text-slate-400 uppercase tracking-widest">Plan de vuelo</p>
            <span className="text-[10px] font-semibold text-blue-300 bg-blue-500/15 border border-blue-500/20 rounded px-2 py-0.5">
              {envio.tramos.length}
            </span>
          </div>

          {envio.tramos.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-slate-500">
              No hay ruta asignada para este envio.
            </p>
          ) : (
            <div className="max-h-56 overflow-y-auto custom-scrollbar divide-y divide-slate-700/50">
              {envio.tramos.map((tramo, i) => (
                <div key={`${tramo.vueloId}-${i}`} className="px-2.5 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-100">Vuelo #{tramo.vueloId}</p>
                      <p className="mt-0.5 text-[10px] font-mono text-slate-400">
                        {tramo.origen} <span className="text-slate-600">-&gt;</span> {tramo.destino}
                      </p>
                    </div>
                    <span className="shrink-0 bg-slate-900/80 text-[10px] px-2 py-0.5 rounded text-slate-300">
                      {tramo.capacidad} cap.
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="rounded bg-slate-900/40 px-2 py-1">
                      <p className="text-[9px] text-slate-500 uppercase tracking-widest">Sale (GMT)</p>
                      <p className="text-[11px] font-mono text-slate-300">{formatGmtMinute(tramo.salidaMinutosGMT)}</p>
                      <p className="text-[9px] text-blue-300 font-semibold">{getFechaLocalDate(fechaInicioRaw || '', tramo.diaOffset)}</p>
                    </div>
                    <div className="rounded bg-slate-900/40 px-2 py-1">
                      <p className="text-[9px] text-slate-500 uppercase tracking-widest">Llega (GMT)</p>
                      <p className="text-[11px] font-mono text-slate-300">{formatGmtMinute(tramo.llegadaMinutosGMT)}</p>
                      <p className="text-[9px] text-blue-300 font-semibold">
                        {getFechaLocalDate(fechaInicioRaw || '', tramo.diaOffset + (tramo.llegadaMinutosGMT < tramo.salidaMinutosGMT ? 1 : 0))}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
