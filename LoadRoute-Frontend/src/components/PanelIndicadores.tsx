'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { RutaResponse } from '@/types/rutas';
import { calcularMetricasReporte, MetricasReporte } from '@/utils/reporte';
import { IconChart, IconClose, IconWarning } from '@/components/icons';
import ModalColapso, { ColapsoDatos } from '@/components/Modals/ModalColapso';

interface PanelIndicadoresProps {
  resultadoCompleto: RutaResponse | null;
  globalStatsAeropuertos?: { carga: number; capacidad: number } | null;
  globalStatsFlota?: { carga: number; capacidad: number } | null;
  umbralVerde?: number;
  umbralAmbar?: number;
  colapsoDatos?: ColapsoDatos | null;
  setColapsoDatos?: (colapso: ColapsoDatos | null) => void;
}



// ─── Barra horizontal SVG ────────────────────────────────────────────────────
interface BarraProps {
  pct: number;
  color: string;
  height?: number;
}

function BarraHorizontal({ pct, color, height = 6 }: BarraProps) {
  const filled = Math.min(Math.max(pct, 0), 100);
  return (
    <svg width="100%" height={height} className="block w-full">
      <rect x={0} y={0} width="100%" height={height} rx={height / 2} fill="#1e293b" />
      <rect
        x={0} y={0}
        width={`${filled}%`}
        height={height}
        rx={height / 2}
        fill={color}
        style={{ transition: 'width 0.6s ease' }}
      />
    </svg>
  );
}

// ─── Colores CSS (fuera de Tailwind para usar en SVG) ────────────────────────
const CLR = {
  emerald:  '#34d399',
  cyan:     '#22d3ee',
  amber:    '#fbbf24',
  indigo:   '#818cf8',
  rose:     '#fb7185',
  violet:   '#a78bfa',
  slate:    '#64748b',
};



// ─── KPI compacto (sin donut) ─────────────────────────────────────────────────
interface KpiCompactProps {
  label: string;
  value: string;
  sub: string;
  color: keyof typeof CLR;
  pct?: number;
}

function KpiCompact({ label, value, sub, color, pct }: KpiCompactProps) {
  const c = CLR[color];
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-3 flex flex-col gap-2">
      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="text-lg font-black leading-none" style={{ color: c }}>{value}</p>
      {pct !== undefined && <BarraHorizontal pct={pct} color={c} />}
      <p className="text-[9px] text-slate-500 leading-none">{sub}</p>
    </div>
  );
}

// ─── Panel principal ─────────────────────────────────────────────────────────
export default function PanelIndicadores({ 
  resultadoCompleto,
  globalStatsAeropuertos,
  globalStatsFlota,
  umbralVerde = 70,
  umbralAmbar = 90,
  colapsoDatos,
  setColapsoDatos,
}: PanelIndicadoresProps) {
  const [open, setOpen] = useState(false);
  const [collapseOpen, setCollapseOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const metricas: MetricasReporte | null = useMemo(() => {
    if (!resultadoCompleto?.resultadoSA) return null;
    return calcularMetricasReporte(resultadoCompleto);
  }, [resultadoCompleto]);

  useEffect(() => {
    if (colapsoDatos) {
      setCollapseOpen(true);
      setOpen(false);
    } else {
      setCollapseOpen(false);
    }
  }, [colapsoDatos]);

  if (!metricas && !colapsoDatos) return null;

  const coberturaPct = metricas ? metricas.coberturaPct : 0;
  const slaPct       = metricas ? metricas.cumpleSLAPct : 0;
  const mejoraPct    = metricas ? metricas.mejoraRelativa * 100 : 0;
  const hayAlerta    = metricas ? (coberturaPct < 90 || metricas.enviosNoAceptados > 0) : false;

  // Colores adaptativos
  const cobColor: keyof typeof CLR = coberturaPct >= 95 ? 'emerald' : coberturaPct >= 80 ? 'amber' : 'rose';
  const slaColor: keyof typeof CLR = slaPct    >= 90 ? 'cyan'    : slaPct    >= 70 ? 'amber' : 'rose';

  // Ocupación Global de Almacenes
  const almacenesCarga = globalStatsAeropuertos?.carga || 0;
  const almacenesCap = globalStatsAeropuertos?.capacidad || 0;
  const almacenesPct = almacenesCap > 0 ? (almacenesCarga / almacenesCap) * 100 : 0;
  let almacenesColor: keyof typeof CLR = 'emerald';
  if (almacenesPct > umbralAmbar) almacenesColor = 'rose';
  else if (almacenesPct > umbralVerde) almacenesColor = 'amber';

  // Ocupación Global de Flota Activa
  const flotaCarga = globalStatsFlota?.carga || 0;
  const flotaCap = globalStatsFlota?.capacidad || 0;
  const flotaPct = flotaCap > 0 ? (flotaCarga / flotaCap) * 100 : 0;
  let flotaColor: keyof typeof CLR = 'emerald';
  if (flotaPct > umbralAmbar) flotaColor = 'rose';
  else if (flotaPct > umbralVerde) flotaColor = 'amber';

  const canShowIndicators = !!metricas;
  const canShowCollapseButton = !!colapsoDatos;
  const showIndicatorPanel = canShowIndicators && open && !collapseOpen;

  const handleCloseCollapse = () => {
    setCollapseOpen(false);
    if (setColapsoDatos) setColapsoDatos(null);
  };

  return (
    <div ref={panelRef} className="absolute top-4 right-4 z-[2000] flex flex-col items-end gap-2">
      {collapseOpen && colapsoDatos && (
        <ModalColapso colapso={colapsoDatos} onClose={handleCloseCollapse} />
      )}

      <div className="flex flex-col items-end gap-2">
        {canShowIndicators && (
          <button
            onClick={() => {
              setCollapseOpen(false);
              setOpen(prev => !prev);
            }}
            aria-label="Ver indicadores de simulación"
            className={
              `relative w-11 h-11 rounded-xl flex items-center justify-center
               border transition-all duration-200 active:scale-95 shadow-xl
               ${open
                 ? 'bg-[#0f1f3d] border-indigo-500/60 text-indigo-300 shadow-indigo-900/40'
                 : 'bg-[#0f1f3d]/90 border-slate-600/50 text-slate-400 hover:text-indigo-300 hover:border-indigo-500/40 shadow-black/50'
               }`
            }
          >
            <IconChart size={18} />
          </button>
        )}

        {canShowCollapseButton && (
          <button
            onClick={() => {
              setOpen(false);
              setCollapseOpen(prev => !prev);
            }}
            aria-label="Ver detalles del colapso"
            className={
              `relative w-11 h-11 rounded-xl flex items-center justify-center
               border transition-all duration-200 active:scale-95 shadow-xl
               ${collapseOpen
                 ? 'bg-[#4b121d] border-red-500/70 text-red-300 shadow-red-900/30'
                 : 'bg-[#0f1f3d]/90 border-slate-600/50 text-slate-400 hover:text-red-300 hover:border-red-500/40 shadow-black/50'
               }`
            }
          >
            <IconWarning size={18} />
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500
                             flex items-center justify-center shadow-md shadow-red-500/30 animate-pulse">
              <span className="text-[8px] font-black text-white">!</span>
            </span>
          </button>
        )}
      </div>

      {showIndicatorPanel && (
        <div
          className={
            `w-80 rounded-xl border border-slate-700/60 shadow-2xl shadow-black/70
            overflow-hidden
            transition-all duration-300 origin-top-right
            opacity-100 scale-100 translate-y-0 pointer-events-auto`
          }
          style={{ background: 'rgba(15,31,61,0.97)', backdropFilter: 'blur(12px)' }}
        >
          {/* Línea de acento superior */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-indigo-500/60 to-transparent" />

          {/* Cabecera */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 bg-black/20">
            <div className="flex items-center gap-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-200 leading-none">
                  Indicadores Global
                </p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-full flex items-center justify-center text-slate-500
                         hover:text-slate-200 hover:bg-slate-700/60 transition-all"
              aria-label="Cerrar indicadores"
            >
              <IconClose size={13} />
            </button>
          </div>

          {/* Cuerpo */}
          <div className="p-4 space-y-4">

            {/* Fila de KPIs compactos — KPIs principales */}
            <div className="grid grid-cols-2 gap-2">
              <KpiCompact
                label="Cobertura"
                value={`${coberturaPct.toFixed(0)}%`}
                sub={`${metricas.enviosAsignados.toLocaleString()} / ${metricas.totalEnvios.toLocaleString()}`}
                color={cobColor}
                pct={coberturaPct}
              />
              <KpiCompact
                label="Cumple SLA"
                value={`${slaPct.toFixed(0)}%`}
                sub={`${metricas.cumpleSLACount.toLocaleString()} a tiempo`}
                color={slaColor}
                pct={slaPct}
              />
            </div>

            {/* Fila de KPIs compactos */}
            <div className="grid grid-cols-2 gap-2">
              <KpiCompact
                label="Viaje Promedio"
                value={`${metricas.tiempoTransitoPromedioHoras.toFixed(1)}h`}
                sub="tiempo de tránsito"
                color="amber"
              />
              <KpiCompact
                label="Carga Movilizada"
                value={metricas.totalMaletas.toLocaleString()}
                sub="maletas ruteadas"
                color="emerald"
              />
            </div>

            {/* Indicadores Globales (Semáforos) en Vivo */}
            {(globalStatsAeropuertos || globalStatsFlota) && (
              <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-3 space-y-3">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                  Monitoreo Global en Vivo (Semáforos)
                </p>
                
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="font-semibold text-slate-300">Ocupación Almacenes</span>
                    <span style={{ color: CLR[almacenesColor] }} className="font-bold">
                      {almacenesPct.toFixed(1)}% <span className="text-slate-500 font-normal">({almacenesCarga.toLocaleString()} / {almacenesCap.toLocaleString()})</span>
                    </span>
                  </div>
                  <BarraHorizontal pct={almacenesPct} color={CLR[almacenesColor]} height={6} />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="font-semibold text-slate-300">Ocupación Flota Activa</span>
                    <span style={{ color: CLR[flotaColor] }} className="font-bold">
                      {flotaPct.toFixed(1)}% <span className="text-slate-500 font-normal">({flotaCarga.toLocaleString()} / {flotaCap.toLocaleString()})</span>
                    </span>
                  </div>
                  <BarraHorizontal pct={flotaPct} color={CLR[flotaColor]} height={6} />
                </div>
              </div>
            )}

            {/* Alerta envíos sin ruta */}
            {metricas.enviosNoAceptados > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg
                              bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[10px]">
                <IconWarning size={12} className="shrink-0 text-amber-400" />
                <span>
                  <strong className="font-bold">{metricas.enviosNoAceptados.toLocaleString()}</strong> envíos sin ruta por capacidad
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
