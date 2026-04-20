package com.loadroute.algorithm.model;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Estado de la solución: asigna a cada envío una secuencia de vuelos (ruta).
 *
 * Función objetivo (minimizar):
 *   f(S) = Σ_i transitoHoras(i)
 *        + ω_sla  · Σ_i max(0, transitoHoras(i) - SLA_i)
 *        + ω_cap  · Σ_j max(0, capacidadUsada(j) - capacidadMax(j))
 */
public class SolucionEstado {

    public static double PESO_SLA                   = 10_000.0;
    public static double PESO_CAPACIDAD_VUELO       = 5_000.0;
    public static double PESO_CAPACIDAD_AEROPUERTO  = 10_000.0;

    private final Map<String, List<Vuelo>> asignaciones;
    private final Map<String, Envio> envios;

    public SolucionEstado(Map<String, Envio> envios) {
        this.envios       = envios;
        this.asignaciones = new LinkedHashMap<>();
        for (String id : envios.keySet()) {
            asignaciones.put(id, new ArrayList<>());
        }
    }

    private SolucionEstado(Map<String, Envio> envios, Map<String, List<Vuelo>> asignaciones) {
        this.envios       = envios;
        this.asignaciones = new LinkedHashMap<>();
        for (Map.Entry<String, List<Vuelo>> e : asignaciones.entrySet()) {
            this.asignaciones.put(e.getKey(), new ArrayList<>(e.getValue()));
        }
    }

    // ── Función objetivo ─────────────────────────────────────────────────────

    public double evaluarCostoTotal() {
        double costo = 0.0;
        Map<Integer, Integer> cargaPorVuelo = new HashMap<>();
        Map<String, List<OccupancyEvent>> eventosPorAero = new HashMap<>();

        for (Map.Entry<String, List<Vuelo>> entry : asignaciones.entrySet()) {
            Envio      envio = envios.get(entry.getKey());
            List<Vuelo> ruta = entry.getValue();

            if (ruta.isEmpty()) {
                costo += PESO_SLA * envio.getSlaHoras();
                continue;
            }

            LocalDateTime recepcionGMT  = envio.getRecepcionGMT();
            int maletas = envio.getCantidadMaletas();
            
            // Simular cronología del envío
            LocalDateTime t = recepcionGMT;
            
            // 1. Origen: Desde recepción hasta salida del primer vuelo
            Vuelo v1 = ruta.get(0);
            LocalDateTime salida1 = v1.getProximaSalidaGMT(t, 30);
            
            String codOrig = envio.getOrigen().getCodigo();
            eventosPorAero.computeIfAbsent(codOrig, k -> new ArrayList<>())
                          .add(new OccupancyEvent(recepcionGMT, maletas));
            eventosPorAero.computeIfAbsent(codOrig, k -> new ArrayList<>())
                          .add(new OccupancyEvent(salida1, -maletas));

            cargaPorVuelo.merge(v1.getId(), maletas, Integer::sum);
            t = v1.getLlegadaGMT(salida1);

            // 2. Conexiones intermedias
            for (int i = 1; i < ruta.size(); i++) {
                Vuelo vk = ruta.get(i);
                LocalDateTime salidaK = vk.getProximaSalidaGMT(t, 30);
                
                String codAero = vk.getOrigen().getCodigo();
                eventosPorAero.computeIfAbsent(codAero, k -> new ArrayList<>())
                              .add(new OccupancyEvent(t, maletas));
                eventosPorAero.computeIfAbsent(codAero, k -> new ArrayList<>())
                              .add(new OccupancyEvent(salidaK, -maletas));

                cargaPorVuelo.merge(vk.getId(), maletas, Integer::sum);
                t = vk.getLlegadaGMT(salidaK);
            }

            // 3. Destino final: No se acumula (según requerimiento)

            // Cálculo de tránsito y SLA
            long transitoHoras = ChronoUnit.HOURS.between(recepcionGMT, t);
            costo += transitoHoras;

            long retraso = transitoHoras - envio.getSlaHoras();
            if (retraso > 0) {
                costo += PESO_SLA * retraso;
            }
        }

        // Penalización: Capacidad de Vuelos
        for (Map.Entry<Integer, Integer> e : cargaPorVuelo.entrySet()) {
            Vuelo v = buscarVueloPorId(e.getKey());
            if (v != null) {
                int exceso = e.getValue() - v.getCapacidadMax();
                if (exceso > 0) {
                    costo += PESO_CAPACIDAD_VUELO * exceso;
                }
            }
        }

        // Penalización: Capacidad de Aeropuertos (Temporal)
        for (Map.Entry<String, List<OccupancyEvent>> entry : eventosPorAero.entrySet()) {
            String codAero = entry.getKey();
            List<OccupancyEvent> eventos = entry.getValue();
            eventos.sort(Comparator.comparing(ev -> ev.tiempo));

            int maxCapAero = buscarCapacidadAero(codAero);
            int ocupacionActual = 0;
            int peakOcupacion = 0;

            for (OccupancyEvent ev : eventos) {
                ocupacionActual += ev.delta;
                if (ocupacionActual > peakOcupacion) peakOcupacion = ocupacionActual;
            }

            int exceso = peakOcupacion - maxCapAero;
            if (exceso > 0) {
                costo += PESO_CAPACIDAD_AEROPUERTO * exceso;
            }
        }

        return costo;
    }

    public boolean esFactible() {
        // En este modelo permitimos excesos ligeros pero los penalizamos fuertemente.
        // Aquí verificamos factibilidad básica: rutas asignadas y capacidad crítica.
        Map<Integer, Integer> cargaPorVuelo = new HashMap<>();
        for (Map.Entry<String, List<Vuelo>> entry : asignaciones.entrySet()) {
            if (entry.getValue().isEmpty()) return false;
            Envio envio = envios.get(entry.getKey());
            for (Vuelo v : entry.getValue()) {
                cargaPorVuelo.merge(v.getId(), envio.getCantidadMaletas(), Integer::sum);
            }
        }
        // Vuelos al límite (se permite 10% de gracia para la metaheurística, pero se penaliza arriba)
        for (Map.Entry<Integer, Integer> e : cargaPorVuelo.entrySet()) {
            Vuelo v = buscarVueloPorId(e.getKey());
            if (v != null && e.getValue() > v.getCapacidadMax() * 1.1) return false;
        }
        return true;
    }

    // ── Clases Internas y Auxiliares ─────────────────────────────────────────

    private static class OccupancyEvent {
        LocalDateTime tiempo;
        int delta;
        OccupancyEvent(LocalDateTime t, int d) { this.tiempo = t; this.delta = d; }
    }

    private int buscarCapacidadAero(String codigo) {
        // Buscamos un envío que salga o llegue de este aeropuerto para obtener la referencia al objeto Aeropuerto
        for (Envio e : envios.values()) {
            if (e.getOrigen().getCodigo().equals(codigo)) return e.getOrigen().getCapacidadMax();
            if (e.getDestino().getCodigo().equals(codigo)) return e.getDestino().getCapacidadMax();
        }
        return 430; // Valor por defecto si no se encuentra
    }

    private Vuelo buscarVueloPorId(int id) {
        for (List<Vuelo> ruta : asignaciones.values()) {
            for (Vuelo v : ruta) {
                if (v.getId() == id) return v;
            }
        }
        return null;
    }

    // ── Mutación de la solución ───────────────────────────────────────────────

    public void asignarRuta(String idEnvio, List<Vuelo> ruta) {
        asignaciones.put(idEnvio, new ArrayList<>(ruta));
    }

    public List<Vuelo> getRuta(String idEnvio) {
        return asignaciones.getOrDefault(idEnvio, Collections.emptyList());
    }

    public void removerRuta(String idEnvio) {
        asignaciones.put(idEnvio, new ArrayList<>());
    }

    public List<String> getEnviosSinRuta() {
        List<String> huerfanos = new ArrayList<>();
        for (Map.Entry<String, List<Vuelo>> e : asignaciones.entrySet()) {
            if (e.getValue().isEmpty()) huerfanos.add(e.getKey());
        }
        return huerfanos;
    }

    public String seleccionarEnvioAleatorio(Random rng) {
        List<String> conRuta = new ArrayList<>();
        for (Map.Entry<String, List<Vuelo>> e : asignaciones.entrySet()) {
            if (!e.getValue().isEmpty()) conRuta.add(e.getKey());
        }
        if (conRuta.isEmpty()) return null;
        return conRuta.get(rng.nextInt(conRuta.size()));
    }

    // ── Clonado ───────────────────────────────────────────────────────────────

    public SolucionEstado clonar() {
        return new SolucionEstado(envios, asignaciones);
    }

    // ── Accesores ─────────────────────────────────────────────────────────────

    public Map<String, List<Vuelo>> getAsignaciones() { return Collections.unmodifiableMap(asignaciones); }
    public Map<String, Envio>       getEnvios()        { return Collections.unmodifiableMap(envios); }
    public int                      getTotalEnvios()   { return envios.size(); }
    public int                      getEnviosAsignados() {
        return (int) asignaciones.values().stream().filter(r -> !r.isEmpty()).count();
    }

    @Override
    public String toString() {
        return String.format("SolucionEstado{envios=%d, asignados=%d, costo=%.2f}",
                getTotalEnvios(), getEnviosAsignados(), evaluarCostoTotal());
    }
}
