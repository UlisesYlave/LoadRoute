import { useState, useEffect } from 'react';
import { BACKEND_URL } from '@/config/constants';
import { RutaMuestra, TramoDTO, AeropuertoDTO } from '@/types/rutas';
import { porcentajeOcupacion, formatPorcentaje } from '@/utils/capacidad';
import { IconPlane, IconClose, IconMap } from '@/components/icons';
import { useDraggable } from '@/hooks/useDraggable';

interface ModalVueloProps {
  vuelo: TramoDTO | null;
  rutasActivas: RutaMuestra[];
  cancelacionesPorDia?: number[][];
  simTotalMinutos?: number;
  fechaInicioRaw?: string;
  onCancelarVuelo?: (vueloId: number, fecha: string) => Promise<void>;
  onReactivarVuelo?: (vueloId: number, fecha: string) => Promise<void>;
  onClose: () => void;
  onSelectEnvio: (envio: RutaMuestra) => void;
  aeropuertos?: AeropuertoDTO[];
  escenario?: number;
  onEnfocarEnMapa?: () => void; // 🌟 NUEVA PROP ASIGNADA
}

function getFechaLocalDate(fechaInicioRaw: string, diaOffset: number): string {
  if (!fechaInicioRaw || fechaInicioRaw.length < 8) return '';
  const y = parseInt(fechaInicioRaw.slice(0, 4));
  const m = parseInt(fechaInicioRaw.slice(4, 6)) - 1;
  const d = parseInt(fechaInicioRaw.slice(6, 8));
  const date = new Date(y, m, d);
  date.setDate(date.getDate() + diaOffset);
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getFechaLocal(fechaInicioRaw: string, diaOffset: number, minutosGMT: number, gmtOffset: number): string {
  if (!fechaInicioRaw || fechaInicioRaw.length < 8) return '';
  const y = parseInt(fechaInicioRaw.slice(0, 4));
  const m = parseInt(fechaInicioRaw.slice(4, 6)) - 1;
  const d = parseInt(fechaInicioRaw.slice(6, 8));
  
  const date = new Date(Date.UTC(y, m, d));
  date.setUTCDate(date.getUTCDate() + diaOffset);
  date.setUTCHours(0, minutosGMT, 0, 0);
  date.setUTCHours(date.getUTCHours() + gmtOffset);
  
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatGmtTime(minutos: number): string {
  const h = Math.floor(minutos / 60) % 24;
  const m = Math.floor(minutos % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} GMT 0`;
}

export default function ModalVuelo({
  vuelo,
  rutasActivas,
  cancelacionesPorDia,
  simTotalMinutos,
  fechaInicioRaw,
  onCancelarVuelo,
  onReactivarVuelo,
  onClose,
  onSelectEnvio,
  aeropuertos,
  escenario,
  onEnfocarEnMapa // 🌟 RECIBIMOS LA PROP
}: ModalVueloProps) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [limiteMinutos, setLimiteMinutos] = useState(60);
  const { position, onMouseDown } = useDraggable(64, 64, !!vuelo);

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/vuelos/config-cancelacion`)
      .then(res => res.json())
      .then(data => {
        if (data.limiteMinutos) {
          setLimiteMinutos(data.limiteMinutos);
        }
      })
      .catch(console.error);
  }, []);

  if (!vuelo) return null;

  const origenAero = aeropuertos?.find(a => a.codigo === vuelo.origen);
  const destinoAero = aeropuertos?.find(a => a.codigo === vuelo.destino);
  const gmtOrigen = origenAero?.gmt ?? 0;
  const gmtDestino = destinoAero?.gmt ?? 0;

  const fechaLocalDespegue = getFechaLocal(fechaInicioRaw || '', vuelo.diaOffset ?? 0, vuelo.salidaMinutosGMT, gmtOrigen);
  const fechaLocalAterrizaje = getFechaLocal(
    fechaInicioRaw || '', 
    (vuelo.diaOffset ?? 0) + (vuelo.llegadaMinutosGMT < vuelo.salidaMinutosGMT ? 1 : 0), 
    vuelo.llegadaMinutosGMT, 
    gmtDestino
  );

  const coincideConVuelo = (tramo: TramoDTO) => (
    tramo.vueloId === vuelo.vueloId &&
    tramo.origen === vuelo.origen &&
    tramo.destino === vuelo.destino &&
    tramo.salidaMinutosGMT === vuelo.salidaMinutosGMT &&
    tramo.llegadaMinutosGMT === vuelo.llegadaMinutosGMT &&
    (tramo.diaOffset ?? 0) === (vuelo.diaOffset ?? 0)
  );

  const enviosEnVuelo = rutasActivas
    .filter(r => r.tramos && r.tramos.some(coincideConVuelo));

  // Calcular ocupación actual 
  const cargaActual = enviosEnVuelo.reduce((sum, r) => sum + r.maletas, 0);

  const porcentaje = formatPorcentaje(porcentajeOcupacion(cargaActual, vuelo.capacidad));

  return (
    <div
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      className="fixed z-[10000] w-[340px] max-w-[calc(100vw-5rem)] max-h-[calc(100vh-5rem)] flex flex-col bg-[#0f1f3d]/95 border border-slate-700 rounded-lg shadow-2xl animate-in fade-in slide-in-from-left-2 duration-200"
    >
        
      {/* Header */}
      <div 
        onMouseDown={onMouseDown}
        className="px-3 py-2.5 border-b border-slate-700/50 flex items-center justify-between bg-black/15 rounded-t-lg shrink-0 cursor-grab active:cursor-grabbing select-none"
      >
        <div className="flex items-center gap-2.5 min-w-0 pointer-events-none">
          <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0">
            <IconPlane size={16} className="text-orange-300" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-white leading-tight truncate">Vuelo #{vuelo.vueloId}</h3>
            <p className="text-[11px] font-semibold text-orange-300 tracking-wide truncate">
              {vuelo.origen} <span className="text-slate-500">→</span> {vuelo.destino}
            </p>
          </div>
        </div>

        {/* ── BOTONES DE ACCIÓN (ENFOQUE Y CERRAR) ── */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onEnfocarEnMapa && (
              <button
              onClick={(e) => {
                  e.stopPropagation(); // Evita interferencias con el arrastre del modal
                  onEnfocarEnMapa();
                }}
              className="w-7 h-7 rounded-full hover:bg-slate-700/50 flex items-center justify-center text-orange-400 hover:text-orange-300 transition-colors shrink-0"
              title="Enfocar en mapa"
              aria-label="Enfocar vuelo en mapa"
            >
              <IconMap size={16} />
            </button>
          )}
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full hover:bg-slate-700/50 flex items-center justify-center text-slate-400 hover:text-white transition-colors shrink-0"
            aria-label="Cerrar modal de vuelo"
          >
            <IconClose size={16} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-3 space-y-3 overflow-y-auto custom-scrollbar flex-1 min-h-0">
          
        {/* Horarios */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-md p-2 text-center">
            <p className="text-[9px] text-slate-400 uppercase tracking-widest mb-0.5">Despegue (GMT 0)</p>
            <p className="text-base font-mono text-slate-200">{formatGmtTime(vuelo.salidaMinutosGMT)}</p>
            <p className="text-[10px] text-orange-300 font-semibold">{getFechaLocalDate(fechaInicioRaw || '', vuelo.diaOffset ?? 0)}</p>
            <p className="text-[9px] text-slate-500 mt-0.5">Local: {vuelo.horaSalidaLocal} ({fechaLocalDespegue})</p>
          </div>
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-md p-2 text-center">
            <p className="text-[9px] text-slate-400 uppercase tracking-widest mb-0.5">Aterrizaje (GMT 0)</p>
            <p className="text-base font-mono text-slate-200">{formatGmtTime(vuelo.llegadaMinutosGMT)}</p>
            <p className="text-[10px] text-orange-300 font-semibold">
              {getFechaLocalDate(fechaInicioRaw || '', (vuelo.diaOffset ?? 0) + (vuelo.llegadaMinutosGMT < vuelo.salidaMinutosGMT ? 1 : 0))}
            </p>
            <p className="text-[9px] text-slate-500 mt-0.5">Local: {vuelo.horaLlegadaLocal} ({fechaLocalAterrizaje})</p>
          </div>
        </div>
        
        {/* Capacidad en Vivo */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-md p-2.5">
          <div className="flex justify-between items-end mb-1.5">
            <div>
               <p className="text-[9px] text-slate-400 uppercase tracking-widest">Ocupación Actual</p>
               <p className="text-base font-bold text-white">
                 {cargaActual} <span className="text-xs font-normal text-slate-500">/ {vuelo.capacidad} maletas</span>
               </p>
            </div>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                cargaActual > vuelo.capacidad ? 'bg-red-500/20 text-red-400' :
                cargaActual > vuelo.capacidad * 0.8 ? 'bg-amber-500/20 text-amber-400' :
                'bg-emerald-500/20 text-emerald-400'
             }`}>
               {porcentaje}%
            </span>
          </div>
          {/* ProgressBar */}
          <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
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

        {/* Mantenimiento de Cancelaciones */}
        {vuelo.diaOffset !== undefined && (
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-md p-2.5 space-y-2">
            <p className="text-[9px] text-slate-400 uppercase tracking-widest">Estado Operativo</p>
            <div className="flex items-center justify-between">
              {cancelacionesPorDia && cancelacionesPorDia[vuelo.diaOffset]?.includes(vuelo.vueloId) ? (
                <span className="text-red-400 font-semibold text-xs flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  Cancelado
                </span>
              ) : (
                <span className="text-emerald-400 font-semibold text-xs flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Operativo
                </span>
              )}
              
              {escenario !== 3 && (
                cancelacionesPorDia && cancelacionesPorDia[vuelo.diaOffset]?.includes(vuelo.vueloId) ? (
                  onReactivarVuelo && (
                    <button
                      disabled={loading}
                      onClick={async () => {
                        const fecha = getFechaLocalDate(fechaInicioRaw || '', vuelo.diaOffset ?? 0);
                        if (!fecha) return;
                        setLoading(true);
                        setErrorMsg('');
                        try {
                          await onReactivarVuelo(vuelo.vueloId, fecha);
                        } catch (err: any) {
                          setErrorMsg(err.message || 'Error al reactivar el vuelo.');
                        } finally {
                          setLoading(false);
                        }
                      }}
                      className="px-2.5 py-1 text-[10px] font-bold rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                    >
                      {loading ? 'Procesando...' : 'Reactivar Vuelo'}
                    </button>
                  )
                ) : (
                  onCancelarVuelo && (() => {
                    const departureInMinutes = (vuelo.diaOffset ?? 0) * 1440 + vuelo.salidaMinutosGMT;
                    const minutesToDeparture = simTotalMinutos !== undefined ? departureInMinutes - simTotalMinutos : 999;
                    const canCancel = minutesToDeparture > limiteMinutos;
                    
                    return (
                      <button
                        disabled={loading || !canCancel}
                        onClick={async () => {
                          const fecha = getFechaLocalDate(fechaInicioRaw || '', vuelo.diaOffset ?? 0);
                          if (!fecha) return;
                          setLoading(true);
                          setErrorMsg('');
                          try {
                            await onCancelarVuelo(vuelo.vueloId, fecha);
                          } catch (err: any) {
                            setErrorMsg(err.message || 'Error al cancelar el vuelo.');
                          } finally {
                            setLoading(false);
                          }
                        }}
                        className={`px-2.5 py-1 text-[10px] font-bold rounded text-white transition-colors ${
                          canCancel 
                            ? 'bg-red-600 hover:bg-red-500' 
                            : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                        }`}
                        title={!canCancel ? `Los vuelos ya despegados o a menos de ${limiteMinutos} minutos de despegar no se pueden cancelar` : ''}
                      >
                        {loading ? 'Procesando...' : 'Cancelar Vuelo'}
                      </button>
                    );
                  })()
                )
              )}
            </div>
            {escenario !== 3 && (() => {
              const departureInMinutes = (vuelo.diaOffset ?? 0) * 1440 + vuelo.salidaMinutosGMT;
              const minutesToDeparture = simTotalMinutos !== undefined ? departureInMinutes - simTotalMinutos : 999;
              const canCancel = minutesToDeparture > limiteMinutos;
              const isCancelled = cancelacionesPorDia && cancelacionesPorDia[vuelo.diaOffset]?.includes(vuelo.vueloId);
              
              if (!canCancel && !isCancelled) {
                return (
                  <p className="text-[10px] text-slate-500 italic">
                    * No cancelable (ventana de {limiteMinutos} min superada)
                  </p>
                );
              }
              return null;
            })()}
            {errorMsg && (
              <p className="text-[10px] text-red-400 bg-red-950/20 border border-red-500/20 rounded p-1 text-center">
                {errorMsg}
              </p>
            )}
          </div>
        )}
        
        {/* Envíos del vuelo */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-md overflow-hidden">
          <div className="px-2.5 py-2 border-b border-slate-700/50 flex items-center justify-between gap-3">
            <p className="text-[9px] text-slate-400 uppercase tracking-widest">Envíos en este avión</p>
            <span className="text-[10px] font-semibold text-blue-300 bg-blue-500/15 border border-blue-500/20 rounded px-2 py-0.5">
              {enviosEnVuelo.length}
            </span>
          </div>

          {enviosEnVuelo.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-slate-500">
              No hay envíos asignados a este vuelo.
            </p>
          ) : (
            <div className="max-h-44 overflow-y-auto custom-scrollbar divide-y divide-slate-700/50">
              {enviosEnVuelo.map(envio => (
                <button
                  key={envio.envioId}
                  type="button"
                  onClick={() => onSelectEnvio(envio)}
                  className="w-full px-2.5 py-2 text-left hover:bg-blue-500/10 focus:outline-none focus-visible:bg-blue-500/15 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-blue-300 truncate">{envio.envioId}</p>
                      <p className="mt-0.5 text-[10px] font-mono text-slate-400">
                        {envio.origen} <span className="text-slate-600">→</span> {envio.destino}
                      </p>
                    </div>
                    <span className="shrink-0 bg-slate-900/80 text-[10px] px-2 py-0.5 rounded text-slate-300">
                      {envio.maletas} maletas
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}