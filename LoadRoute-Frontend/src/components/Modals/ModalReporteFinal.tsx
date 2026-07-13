import React, { useMemo } from 'react';
import { RutaResponse, AeropuertoDTO } from '@/types/rutas';
import { calcularMetricasReporte } from '@/utils/reporte';
import { exportarAExcel, exportarAPDF } from '@/utils/exportUtils';
import {
  IconClose,
  IconFilePdf,
  IconFileExcel,
  IconBuilding,
  IconCheck,
  IconWarning,
} from '@/components/icons';

interface ModalReporteFinalProps {
  isOpen: boolean;
  onClose: () => void;
  resultadoCompleto: RutaResponse | null;
}

export default function ModalReporteFinal({
  isOpen,
  onClose,
  resultadoCompleto,
}: ModalReporteFinalProps) {
  const metricas = useMemo(() => {
    if (!resultadoCompleto) return null;
    return calcularMetricasReporte(resultadoCompleto);
  }, [resultadoCompleto]);

  const aeropuertos = useMemo(() => {
    return resultadoCompleto?.aeropuertos || [];
  }, [resultadoCompleto]);

  // Mapear picos de ocupación a los aeropuertos y ordenarlos de mayor a menor porcentaje de ocupación pico
  const aeropuertosConPicos = useMemo(() => {
    if (!metricas || !aeropuertos) return [];
    return aeropuertos
      .map(a => {
        const pico = metricas.picoCargas[a.codigo] || 0;
        const capacidad = a.capacidadMax;
        const porcentaje = capacidad > 0 ? (pico / capacidad) * 100 : 0;
        return {
          ...a,
          pico,
          porcentaje: Math.round(porcentaje * 10) / 10,
        };
      })
      .sort((a, b) => b.porcentaje - a.porcentaje);
  }, [aeropuertos, metricas]);

  if (!isOpen || !resultadoCompleto || !metricas) return null;

  const coberturaPct = metricas.coberturaPct.toFixed(1);
  const cumpleSLAPct = metricas.cumpleSLAPct.toFixed(1);
  const tiempoPromedioText = metricas.tiempoTransitoPromedioHoras.toFixed(1);
  const diasSimulados = resultadoCompleto.sa || 3; // o el escenario/días de simulación

  // Determinar si hay algún colapso en los picos
  const hayColapso = aeropuertosConPicos.some(a => a.pico >= a.capacidadMax && a.capacidadMax > 0);

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[85vh] flex flex-col bg-[#0f1f3d]/95 border border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Cabecera */}
        <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between bg-black/20 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
              <span className="text-xl">📊</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">Reporte Final de Simulación</h2>
              <p className="text-xs text-slate-400">
                Resumen de métricas de desempeño del periodo simulado ({diasSimulados} días)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-700/50 flex items-center justify-center text-slate-400 hover:text-white transition-all shrink-0"
            aria-label="Cerrar reporte"
          >
            <IconClose size={18} />
          </button>
        </div>

        {/* Cuerpo del reporte */}
        <div className="p-5 overflow-y-auto custom-scrollbar space-y-6 flex-1 min-h-0">
          
          {/* Fila de Tarjetas KPI */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            
            {/* Cobertura */}
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3.5 flex flex-col justify-between">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">Cobertura</p>
              <div>
                <p className="text-2xl font-black text-white leading-none mb-1">{coberturaPct}%</p>
                <p className="text-[10px] text-slate-400">
                  {metricas.enviosAsignados.toLocaleString()} / {metricas.totalEnvios.toLocaleString()} pedidos
                </p>
              </div>
            </div>

            {/* Cumplimiento SLA */}
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3.5 flex flex-col justify-between">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">Cumple SLA</p>
              <div>
                <p className="text-2xl font-black text-cyan-400 leading-none mb-1">{cumpleSLAPct}%</p>
                <p className="text-[10px] text-slate-400">
                  {metricas.cumpleSLACount.toLocaleString()} pedidos a tiempo
                </p>
              </div>
            </div>

            {/* Tránsito Promedio */}
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3.5 flex flex-col justify-between">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">Viaje Promedio</p>
              <div>
                <p className="text-2xl font-black text-amber-400 leading-none mb-1">{tiempoPromedioText}h</p>
                <p className="text-[10px] text-slate-400">Tiempo de viaje por envío</p>
              </div>
            </div>

            {/* Total Maletas */}
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3.5 flex flex-col justify-between">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">Carga Movilizada</p>
              <div>
                <p className="text-2xl font-black text-emerald-400 leading-none mb-1">{metricas.totalMaletas.toLocaleString()}</p>
                <p className="text-[10px] text-slate-400">Maletas totales ruteadas</p>
              </div>
            </div>

          </div>

          {/* Advertencia si hay colapsos */}
          {hayColapso ? (
            <div className="bg-red-500/10 border border-red-500/20 text-red-300 rounded-xl p-3 flex gap-3 items-center text-xs">
              <IconWarning size={20} className="text-red-400 shrink-0" />
              <div>
                <p className="font-bold">Colapso de capacidad detectado</p>
                <p className="text-[11px] text-red-400/90">
                  Uno o más almacenes alcanzaron el 100% de su capacidad máxima durante el periodo. Revisa la lista de aeropuertos abajo para identificar los cuellos de botella.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-xl p-3 flex gap-3 items-center text-xs">
              <IconCheck size={20} className="text-emerald-400 shrink-0" />
              <div>
                <p className="font-bold">Operación exitosa sin colapsos</p>
                <p className="text-[11px] text-emerald-400/90">
                  Todos los almacenes mantuvieron su carga por debajo del límite de capacidad máxima durante todo el periodo simulado.
                </p>
              </div>
            </div>
          )}

          {/* Sección de Picos de Ocupación por Aeropuerto */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <IconBuilding size={14} className="text-blue-400" />
              Picos de Ocupación de Almacenes (Top Críticos)
            </h3>
            <div className="bg-slate-800/20 border border-slate-700/50 rounded-xl p-4 space-y-3.5">
              {aeropuertosConPicos.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">No hay información de aeropuertos disponible</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                  {aeropuertosConPicos.slice(0, 10).map(a => {
                    const isColapso = a.pico >= a.capacidadMax && a.capacidadMax > 0;
                    const isRiesgo = a.pico > a.capacidadMax * 0.8 && a.capacidadMax > 0;
                    
                    const progressColor = isColapso ? 'bg-red-500' : isRiesgo ? 'bg-amber-500' : 'bg-emerald-500';
                    const textColor = isColapso ? 'text-red-400 font-bold' : isRiesgo ? 'text-amber-400' : 'text-slate-300';
                    
                    return (
                      <div key={a.codigo} className="space-y-1.5">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-slate-200">
                            {a.codigo} <span className="text-[10px] font-normal text-slate-400">({a.ciudad})</span>
                          </span>
                          <span className={textColor}>
                            {a.pico} / {a.capacidadMax} <span className="text-[10px] text-slate-400">({a.porcentaje}%)</span>
                          </span>
                        </div>
                        <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
                            style={{ width: `${Math.min(a.porcentaje, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {aeropuertosConPicos.length > 10 && (
                <p className="text-[10px] text-slate-500 text-center italic pt-2">
                  * Mostrando los 10 aeropuertos más cargados. Para ver el detalle de los {aeropuertosConPicos.length} aeropuertos, exporta el reporte completo.
                </p>
              )}
            </div>
          </div>

          {/* Sección de Optimización del Algoritmo (Simulated Annealing) */}
          {metricas.costoInicial > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                ⚙️ Resultados del Algoritmo de Ruteo
              </h3>
              <div className="bg-slate-800/20 border border-slate-700/50 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">Costo Inicial</p>
                  <p className="text-sm font-mono font-bold text-slate-300">{metricas.costoInicial.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">Costo Optimizado</p>
                  <p className="text-sm font-mono font-bold text-emerald-400">{metricas.costoFinal.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">Mejora Relativa</p>
                  <p className="text-sm font-mono font-bold text-cyan-400">{(metricas.mejoraRelativa * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">Tiempo de Cómputo</p>
                  <p className="text-sm font-mono font-bold text-slate-300">{metricas.tiempoEjecucionMs} ms</p>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Pie de página con botones de exportar y acción rápida */}
        <div className="px-5 py-4 border-t border-slate-700/50 bg-black/20 flex flex-col sm:flex-row items-center gap-3 shrink-0">
          <div className="flex gap-2 w-full sm:w-auto sm:flex-1">
            <button
              onClick={() => exportarAPDF(resultadoCompleto)}
              className="flex-1 sm:flex-none bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 py-2 px-4 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
            >
              <IconFilePdf size={14} /> Exportar PDF
            </button>
            <button
              onClick={() => exportarAExcel(resultadoCompleto)}
              className="flex-1 sm:flex-none bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 py-2 px-4 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
            >
              <IconFileExcel size={14} /> Exportar Excel
            </button>
          </div>
          <button
            onClick={onClose}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-6 rounded-lg text-xs transition-colors"
          >
            Aceptar
          </button>
        </div>

      </div>
    </div>
  );
}
