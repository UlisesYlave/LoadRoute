import { AeropuertoDTO, RutaMuestra } from '@/types/rutas';
import { calcularCargaAeropuertoActual, porcentajeOcupacion, formatPorcentaje, obtenerEnviosEnAeropuertoActual } from '@/utils/capacidad';
import { IconBuilding, IconClose, IconMap } from '@/components/icons';

interface ModalAeropuertoProps {
  aeropuerto: AeropuertoDTO | null;
  rutasActivas?: RutaMuestra[];
  simTiempoMinutos?: number;
  cargasAeropuertoOverride?: Record<string, number> | null;
  onClose: () => void;
  onSelectEnvio?: (e: RutaMuestra) => void;
  onEnfocarEnMapa?: () => void; // 🌟 NUEVA PROP ASIGNADA
}

export default function ModalAeropuerto({
  aeropuerto,
  rutasActivas,
  simTiempoMinutos,
  cargasAeropuertoOverride,
  onClose,
  onSelectEnvio,
  onEnfocarEnMapa, // 🌟 RECIBIMOS LA PROP
}: ModalAeropuertoProps) {
  if (!aeropuerto) return null;

  const rutas = rutasActivas ?? [];
  const cargaActual = cargasAeropuertoOverride?.[aeropuerto.codigo]
    ?? (simTiempoMinutos !== undefined
      ? calcularCargaAeropuertoActual(aeropuerto.codigo, rutas, simTiempoMinutos)
      : 0);
  const porcentajeValor = porcentajeOcupacion(cargaActual, aeropuerto.capacidadMax);
  const porcentaje = formatPorcentaje(porcentajeValor);
  const enColapso = aeropuerto.capacidadMax > 0 && cargaActual >= aeropuerto.capacidadMax;
  const enRiesgo = cargaActual > aeropuerto.capacidadMax * 0.8;

  const actividad = { salidas: 0, llegadas: 0, transito: 0 };
  for (const ruta of rutas) {
    if (!ruta.tramos || ruta.tramos.length === 0) continue;
    if (ruta.origen === aeropuerto.codigo) actividad.salidas++;
    if (ruta.destino === aeropuerto.codigo) actividad.llegadas++;
    for (let i = 0; i < ruta.tramos.length - 1; i++) {
      if (ruta.tramos[i].destino === aeropuerto.codigo) actividad.transito++;
    }
  }

  const enviosEnAeropuerto = simTiempoMinutos !== undefined
    ? obtenerEnviosEnAeropuertoActual(aeropuerto.codigo, rutas, simTiempoMinutos)
    : [];

  return (
    <div className="fixed left-16 top-16 z-[10000] w-[340px] max-w-[calc(100vw-5rem)] max-h-[calc(100vh-5rem)] flex flex-col bg-[#0f1f3d]/95 border border-slate-700 rounded-lg shadow-2xl animate-in fade-in slide-in-from-left-2 duration-200">
      
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-slate-700/50 flex items-center justify-between bg-black/15 rounded-t-lg shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
            <IconBuilding size={16} className="text-emerald-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-white leading-tight truncate">{aeropuerto.codigo}</h3>
            <p className="text-[11px] font-semibold text-emerald-400 tracking-wider truncate">
              {aeropuerto.ciudad}, {aeropuerto.pais}
            </p>
          </div>
        </div>

        {/* ── BOTONES DE ACCIÓN (ENFOQUE Y CERRAR) ── */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onEnfocarEnMapa && (
            <button
              onClick={(e) => {
              e.stopPropagation(); // Previene problemas si agregas arrastre (draggable) en el futuro
              onEnfocarEnMapa();
            }}
              className="w-7 h-7 rounded-full hover:bg-slate-700/50 flex items-center justify-center text-emerald-400 hover:text-emerald-300 transition-colors shrink-0"
              title="Enfocar en mapa"
              aria-label="Enfocar aeropuerto en mapa"
            >
              <IconMap size={16} />
            </button>
          )}
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full hover:bg-slate-700/50 flex items-center justify-center text-slate-400 hover:text-white transition-colors shrink-0"
            aria-label="Cerrar modal de aeropuerto"
          >
            <IconClose size={16} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-3 space-y-3 overflow-y-auto custom-scrollbar flex-1 min-h-0">
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-md p-2.5">
          <div className="flex justify-between items-end gap-3 mb-1.5">
            <div className="min-w-0">
              <p className="text-[9px] text-slate-400 uppercase tracking-widest">Ocupacion actual</p>
              <p className="text-base font-bold text-white">
                {cargaActual} <span className="text-xs font-normal text-slate-500">/ {aeropuerto.capacidadMax} maletas</span>
              </p>
            </div>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded shrink-0 ${
              enColapso ? 'bg-red-500/20 text-red-400' :
              enRiesgo ? 'bg-amber-500/20 text-amber-400' :
              'bg-emerald-500/20 text-emerald-400'
            }`}>
              {porcentaje}%
            </span>
          </div>
          <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                enColapso ? 'bg-red-500' :
                enRiesgo ? 'bg-amber-500' :
                'bg-emerald-500'
              }`}
              style={{ width: `${porcentajeValor}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-md p-2 text-center">
            <p className="text-[9px] text-slate-400 uppercase tracking-widest mb-0.5">Zona</p>
            <p className="text-base font-mono text-slate-200">GMT{aeropuerto.gmt >= 0 ? '+' : ''}{aeropuerto.gmt}</p>
          </div>
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-md p-2 text-center">
            <p className="text-[9px] text-slate-400 uppercase tracking-widest mb-0.5">Region</p>
            <p className="text-xs font-semibold text-slate-200 capitalize truncate">{aeropuerto.continente.replace('_', ' ')}</p>
          </div>
        </div>

        <div className="bg-slate-800/40 border border-slate-700/50 rounded-md overflow-hidden">
          <div className="px-2.5 py-2 border-b border-slate-700/50 flex items-center justify-between gap-3">
            <p className="text-[9px] text-slate-400 uppercase tracking-widest">Actividad del aeropuerto</p>
            {enColapso && (
              <span className="text-[10px] font-semibold text-red-300 bg-red-500/15 border border-red-500/20 rounded px-2 py-0.5">
                Colapso
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 divide-x divide-slate-700/50">
            <div className="px-2 py-3 text-center">
              <p className="text-lg font-bold text-emerald-400">{actividad.salidas}</p>
              <p className="text-[10px] text-slate-500">salen</p>
            </div>
            <div className="px-2 py-3 text-center">
              <p className="text-lg font-bold text-blue-300">{actividad.llegadas}</p>
              <p className="text-[10px] text-slate-500">llegan</p>
            </div>
            <div className="px-2 py-3 text-center">
              <p className="text-lg font-bold text-amber-300">{actividad.transito}</p>
              <p className="text-[10px] text-slate-500">transito</p>
            </div>
          </div>
        </div>

        {/* Listado de Envíos en el Almacén */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-md overflow-hidden flex flex-col">
          <div className="px-2.5 py-2 border-b border-slate-700/50">
            <p className="text-[9px] text-slate-400 uppercase tracking-widest">Pedidos en almacén ({enviosEnAeropuerto.length})</p>
          </div>
          <div className="p-2 space-y-1.5 overflow-y-auto max-h-[160px] custom-scrollbar">
            {enviosEnAeropuerto.length === 0 ? (
              <p className="text-[11px] text-slate-500 text-center py-3">No hay pedidos en este almacén actualmente</p>
            ) : (
              enviosEnAeropuerto.map(envio => {
                let tipoFlujo = 'Tránsito';
                let badgeColor = 'text-amber-400 bg-amber-950/20 border-amber-500/30';
                if (envio.origen === aeropuerto.codigo) {
                  tipoFlujo = 'Sale';
                  badgeColor = 'text-emerald-400 bg-emerald-950/20 border-emerald-500/30';
                } else if (envio.destino === aeropuerto.codigo) {
                  tipoFlujo = 'Entra';
                  badgeColor = 'text-blue-400 bg-blue-950/20 border-blue-500/30';
                }

                return (
                  <div
                    key={envio.envioId}
                    onClick={() => onSelectEnvio && onSelectEnvio(envio)}
                    className="p-2 rounded bg-slate-900/30 border border-slate-700/30 hover:border-slate-500/50 hover:bg-slate-800/50 transition-all cursor-pointer flex justify-between items-center"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[11px] font-mono font-bold text-slate-200 truncate">{envio.envioId}</span>
                        <span className={`text-[8px] font-bold uppercase px-1 rounded border shrink-0 ${badgeColor}`}>
                          {tipoFlujo}
                        </span>
                      </div>
                      <p className="text-[9px] text-slate-400">
                        Ruta: <span className="font-semibold">{envio.origen}</span> → <span className="font-semibold">{envio.destino}</span>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-bold text-cyan-400 bg-cyan-950/20 border border-cyan-800/30 rounded px-1.5 py-0.5">
                        {envio.maletas} {envio.maletas === 1 ? 'maleta' : 'maletas'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
