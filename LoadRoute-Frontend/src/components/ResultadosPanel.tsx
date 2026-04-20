'use client';

import React from 'react';
import { ResultadoAlgoritmo } from '@/types/rutas';

interface ResultadosPanelProps {
  resultadoSA: ResultadoAlgoritmo | null;
  resultadoALNS: ResultadoAlgoritmo | null;
  escenario: number;
  totalVuelos: number;
  totalEnvios: number;
}

function MetricCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    blue: 'border-blue-500/30 text-blue-400',
    green: 'border-emerald-500/30 text-emerald-400',
    cyan: 'border-cyan-500/30 text-cyan-400',
    amber: 'border-amber-500/30 text-amber-400',
    red: 'border-red-500/30 text-red-400',
    purple: 'border-purple-500/30 text-purple-400',
  };

  return (
    <div className={`rounded-lg border bg-slate-800/40 p-3 ${colorClasses[color]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
      <p className={`text-lg font-bold ${colorClasses[color]?.split(' ')[1]}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function AlgoritmoBloque({ res, color }: { res: ResultadoAlgoritmo; color: 'blue' | 'green' }) {
  const borderColor = color === 'blue' ? 'border-blue-500/20' : 'border-emerald-500/20';
  const headerBg = color === 'blue' ? 'bg-blue-500/10' : 'bg-emerald-500/10';
  const titleColor = color === 'blue' ? 'text-blue-400' : 'text-emerald-400';

  return (
    <div className={`rounded-lg border ${borderColor} overflow-hidden`}>
      {/* Mensaje de Colapso si existe */}
      {res.mensajeColapso && (
        <div className="bg-red-900/50 border-b border-red-500/50 p-3 text-red-300 text-xs font-bold text-center animate-pulse shadow-inner">
          ⚠️ {res.mensajeColapso}
        </div>
      )}

      {/* Header */}
      <div className={`px-4 py-2.5 ${headerBg} flex items-center justify-between`}>
        <span className={`text-sm font-semibold ${titleColor}`}>{res.algoritmo}</span>
        <span className="text-[10px] text-slate-400">
          {res.tiempoEjecucionMs < 1000
            ? `${res.tiempoEjecucionMs} ms`
            : `${(res.tiempoEjecucionMs / 1000).toFixed(1)} s`}
        </span>
      </div>

      {/* Metrics Grid */}
      <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MetricCard
          label="Costo Inicial"
          value={formatCosto(res.costoInicial)}
          color={color === 'blue' ? 'blue' : 'green'}
        />
        <MetricCard
          label="Costo Final"
          value={formatCosto(res.costoFinal)}
          color={color === 'blue' ? 'cyan' : 'cyan'}
        />
        <MetricCard
          label="Mejora"
          value={`${res.mejoraRelativa.toFixed(1)}%`}
          sub={`${res.iteraciones.toLocaleString()} iteraciones`}
          color={res.mejoraRelativa > 0 ? 'green' : 'red'}
        />
        <MetricCard
          label="Asignados"
          value={`${res.enviosAsignados}/${res.totalEnvios}`}
          sub={`${((res.enviosAsignados / Math.max(res.totalEnvios, 1)) * 100).toFixed(0)}% cobertura`}
          color="amber"
        />
      </div>

      {/* Rutas muestra */}
      {res.rutasMuestra && res.rutasMuestra.length > 0 && (
        <div className="border-t border-slate-700/50">
          <div className="px-4 py-2 bg-slate-800/30">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Muestra de Rutas ({res.rutasMuestra.length})
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700/40 text-slate-400">
                  <th className="text-left px-4 py-2 font-medium">Envío</th>
                  <th className="text-left px-4 py-2 font-medium">Ruta</th>
                  <th className="text-right px-4 py-2 font-medium">Maletas</th>
                  <th className="text-right px-4 py-2 font-medium">SLA</th>
                </tr>
              </thead>
              <tbody>
                {res.rutasMuestra.map((ruta, i) => (
                  <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-2 font-mono text-slate-300">{ruta.envioId.slice(-5)}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="font-semibold text-blue-300">{ruta.origen}</span>
                        {ruta.tramos.map((t, j) => (
                          <React.Fragment key={j}>
                            <span className="text-slate-500">→</span>
                            <span className="text-emerald-300">{t.destino}</span>
                          </React.Fragment>
                        ))}
                      </div>
                    </td>
                    <td className="text-right px-4 py-2 text-slate-300">{ruta.maletas}</td>
                    <td className="text-right px-4 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold
                          ${ruta.slaHoras <= 24 ? 'bg-blue-500/20 text-blue-300' : 'bg-amber-500/20 text-amber-300'}`}
                      >
                        {ruta.slaHoras}h
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ResultadosPanel({
  resultadoSA,
  resultadoALNS,
  escenario,
  totalVuelos,
  totalEnvios,
}: ResultadosPanelProps) {
  if (!resultadoSA && !resultadoALNS) return null;

  return (
    <div className="space-y-4 fade-in-up">
      {/* Resumen de red */}
      <div className="flex items-center gap-4 text-xs text-slate-400 px-1">
        <span>🌐 Red: <strong className="text-slate-200">{totalVuelos.toLocaleString()}</strong> vuelos</span>
        <span className="text-slate-600">|</span>
        <span>📦 Envíos procesados: <strong className="text-slate-200">{totalEnvios.toLocaleString()}</strong></span>
        <span className="text-slate-600">|</span>
        <span>Escenario: <strong className="text-slate-200">{escenario}</strong></span>
      </div>

      {/* SA */}
      {resultadoSA && <AlgoritmoBloque res={resultadoSA} color="blue" />}

      {/* ALNS */}
      {resultadoALNS && <AlgoritmoBloque res={resultadoALNS} color="green" />}

      {/* Comparación side-by-side para escenario 2/3 */}
      {resultadoSA && resultadoALNS && (
        <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-4">
          <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-3">
            Comparativa SA vs ALNS
          </p>
          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            <div>
              <p className="text-slate-400 mb-1">Costo Final</p>
              <p className={`font-bold ${resultadoSA.costoFinal <= resultadoALNS.costoFinal ? 'text-blue-400' : 'text-emerald-400'}`}>
                {resultadoSA.costoFinal <= resultadoALNS.costoFinal ? 'SA ✓' : 'ALNS ✓'}
              </p>
            </div>
            <div>
              <p className="text-slate-400 mb-1">Mejora %</p>
              <p className={`font-bold ${resultadoSA.mejoraRelativa >= resultadoALNS.mejoraRelativa ? 'text-blue-400' : 'text-emerald-400'}`}>
                {resultadoSA.mejoraRelativa >= resultadoALNS.mejoraRelativa ? 'SA ✓' : 'ALNS ✓'}
              </p>
            </div>
            <div>
              <p className="text-slate-400 mb-1">Tiempo</p>
              <p className={`font-bold ${resultadoSA.tiempoEjecucionMs <= resultadoALNS.tiempoEjecucionMs ? 'text-blue-400' : 'text-emerald-400'}`}>
                {resultadoSA.tiempoEjecucionMs <= resultadoALNS.tiempoEjecucionMs ? 'SA ✓' : 'ALNS ✓'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatCosto(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}
