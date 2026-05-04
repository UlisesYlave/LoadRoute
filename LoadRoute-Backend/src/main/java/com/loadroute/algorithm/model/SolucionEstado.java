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
    private final Set<String> idsNoAceptados = new HashSet<>();

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

    /**
     * Convierte la capacidad de aeropuertos en restriccion dura.
     * Si un envio no cabe en origen o conexiones durante sus intervalos de espera,
     * se remueve su ruta y queda registrado como no aceptado.
     */
    public int aplicarRestriccionCapacidadAeropuertos() {
        return aplicarRestriccionCapacidadAeropuertos(new HashMap<>());
    }

    public int aplicarRestriccionCapacidadAeropuertos(Map<String, List<OccupancyEvent>> reservasPorAero) {
        idsNoAceptados.clear();
        Map<String, List<OccupancyEvent>> eventosPorAero = reservasPorAero != null ? reservasPorAero : new HashMap<>();
        List<String> idsConRuta = new ArrayList<>();

        for (Map.Entry<String, List<Vuelo>> entry : asignaciones.entrySet()) {
            if (!entry.getValue().isEmpty()) idsConRuta.add(entry.getKey());
        }

        idsConRuta.sort(Comparator
                .comparing((String id) -> envios.get(id).getRecepcionGMT())
                .thenComparing(id -> id));

        for (String id : idsConRuta) {
            Envio envio = envios.get(id);
            List<Vuelo> ruta = asignaciones.getOrDefault(id, Collections.emptyList());
            List<AirportInterval> intervalos = construirIntervalosAeropuerto(envio, ruta);

            boolean cabe = true;
            for (AirportInterval intervalo : intervalos) {
                List<OccupancyEvent> eventos = eventosPorAero.getOrDefault(intervalo.codigoAeropuerto, Collections.emptyList());
                if (!cabeEnIntervalo(eventos, intervalo.inicio, intervalo.fin, intervalo.maletas, intervalo.capacidadMax)) {
                    cabe = false;
                    break;
                }
            }

            if (!cabe) {
                removerRuta(id);
                idsNoAceptados.add(id);
                continue;
            }

            for (AirportInterval intervalo : intervalos) {
                List<OccupancyEvent> eventos = eventosPorAero.computeIfAbsent(intervalo.codigoAeropuerto, k -> new ArrayList<>());
                eventos.add(new OccupancyEvent(intervalo.inicio, intervalo.maletas));
                eventos.add(new OccupancyEvent(intervalo.fin, -intervalo.maletas));
            }
        }

        return idsNoAceptados.size();
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
            eventos.sort(this::compararEventos);

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

    public static class OccupancyEvent {
        public LocalDateTime tiempo;
        public int delta;
        public OccupancyEvent(LocalDateTime t, int d) { this.tiempo = t; this.delta = d; }
    }

    private static class AirportInterval {
        String codigoAeropuerto;
        LocalDateTime inicio;
        LocalDateTime fin;
        int maletas;
        int capacidadMax;

        AirportInterval(String codigoAeropuerto, LocalDateTime inicio, LocalDateTime fin, int maletas, int capacidadMax) {
            this.codigoAeropuerto = codigoAeropuerto;
            this.inicio = inicio;
            this.fin = fin;
            this.maletas = maletas;
            this.capacidadMax = capacidadMax;
        }
    }

    private List<AirportInterval> construirIntervalosAeropuerto(Envio envio, List<Vuelo> ruta) {
        List<AirportInterval> intervalos = new ArrayList<>();
        if (envio == null || ruta == null || ruta.isEmpty()) return intervalos;

        int maletas = envio.getCantidadMaletas();
        LocalDateTime t = envio.getRecepcionGMT();

        Vuelo primero = ruta.get(0);
        LocalDateTime salida = primero.getProximaSalidaGMT(t, 30);
        agregarIntervalo(intervalos, envio.getOrigen(), t, salida, maletas);
        t = primero.getLlegadaGMT(salida);

        for (int i = 1; i < ruta.size(); i++) {
            Vuelo vuelo = ruta.get(i);
            salida = vuelo.getProximaSalidaGMT(t, 30);
            agregarIntervalo(intervalos, vuelo.getOrigen(), t, salida, maletas);
            t = vuelo.getLlegadaGMT(salida);
        }

        return intervalos;
    }

    private void agregarIntervalo(List<AirportInterval> intervalos, Aeropuerto aeropuerto,
                                  LocalDateTime inicio, LocalDateTime fin, int maletas) {
        if (aeropuerto == null || inicio == null || fin == null || !fin.isAfter(inicio)) return;
        intervalos.add(new AirportInterval(
                aeropuerto.getCodigo(),
                inicio,
                fin,
                maletas,
                aeropuerto.getCapacidadMax()
        ));
    }

    private boolean cabeEnIntervalo(List<OccupancyEvent> eventosExistentes,
                                    LocalDateTime inicio,
                                    LocalDateTime fin,
                                    int maletas,
                                    int capacidadMax) {
        List<OccupancyEvent> eventos = new ArrayList<>(eventosExistentes);
        eventos.sort(this::compararEventos);

        int ocupacion = 0;
        for (OccupancyEvent ev : eventos) {
            if (!ev.tiempo.isAfter(inicio)) {
                ocupacion += ev.delta;
                continue;
            }
            if (!ev.tiempo.isBefore(fin)) break;
            if (ocupacion + maletas > capacidadMax) return false;
            ocupacion += ev.delta;
        }

        return ocupacion + maletas <= capacidadMax;
    }

    private int compararEventos(OccupancyEvent a, OccupancyEvent b) {
        int cmp = a.tiempo.compareTo(b.tiempo);
        if (cmp != 0) return cmp;
        return Integer.compare(a.delta, b.delta);
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
    public Set<String>              getIdsAsignados() {
        Set<String> ids = new HashSet<>();
        for (Map.Entry<String, List<Vuelo>> e : asignaciones.entrySet()) {
            if (!e.getValue().isEmpty()) {
                ids.add(e.getKey());
            }
        }
        return ids;
    }
    public Set<String>              getIdsNoAceptados() { return Collections.unmodifiableSet(idsNoAceptados); }

    @Override
    public String toString() {
        return String.format("SolucionEstado{envios=%d, asignados=%d, costo=%.2f}",
                getTotalEnvios(), getEnviosAsignados(), evaluarCostoTotal());
    }
}
