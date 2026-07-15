package com.loadroute.algorithm.graph;

import com.loadroute.algorithm.model.Aeropuerto;
import com.loadroute.algorithm.model.Envio;
import com.loadroute.algorithm.model.Vuelo;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;

/**
 * Grafo de la red logística de Tasf.B2B.
 *
 * Cada nodo es un aeropuerto. Cada arista dirigida es un vuelo (con horario y capacidad).
 * El BFS encuentra rutas viables respetando capacidad, SLA y tiempo de conexión.
 */
public class RedLogistica {

    public static final int MAX_TRANSBORDOS  = 3;
    public static final int MAX_RUTAS        = 10;

    private final int tiempoEsperaEscala;
    private final Map<String, Aeropuerto>  aeropuertos;
    private final Map<String, List<Vuelo>> vuelosPorOrigen;

    public RedLogistica(Collection<Aeropuerto> aeropuertos, Collection<Vuelo> vuelos, int tiempoEsperaEscala) {
        this.tiempoEsperaEscala = tiempoEsperaEscala;
        this.aeropuertos      = new HashMap<>();
        this.vuelosPorOrigen  = new HashMap<>();

        for (Aeropuerto a : aeropuertos) {
            this.aeropuertos.put(a.getCodigo(), a);
            this.vuelosPorOrigen.put(a.getCodigo(), new ArrayList<>());
        }
        for (Vuelo v : vuelos) {
            this.vuelosPorOrigen
                    .computeIfAbsent(v.getOrigen().getCodigo(), k -> new ArrayList<>())
                    .add(v);
        }
    }

    public List<List<Vuelo>> buscarRutas(Envio envio, boolean soloConCapacidad, LocalDateTime minSalidaGMT) {
        return buscarRutas(envio, soloConCapacidad, Collections.emptySet(), minSalidaGMT);
    }

    public List<List<Vuelo>> buscarRutas(Envio envio, boolean soloConCapacidad, Set<String> vuelosCancelados, LocalDateTime minSalidaGMT) {
        String          codigoOrigen  = envio.getOrigen().getCodigo();
        String          codigoDestino = envio.getDestino().getCodigo();
        LocalDateTime   disponibleGMT = minSalidaGMT != null && minSalidaGMT.isAfter(envio.getRecepcionGMT()) 
                                             ? minSalidaGMT 
                                             : envio.getRecepcionGMT();
        LocalDateTime   deadlineGMT   = envio.getDeadlineGMT();
        int             maletas       = envio.getCantidadMaletas();

        List<List<Vuelo>> rutasEncontradas = new ArrayList<>();

        Queue<BFSEstado> cola = new LinkedList<>();
        cola.add(new BFSEstado(codigoOrigen, disponibleGMT, new ArrayList<>()));

        while (!cola.isEmpty() && rutasEncontradas.size() < MAX_RUTAS) {
            BFSEstado estado = cola.poll();

            if (estado.ruta.size() >= MAX_TRANSBORDOS) continue;

            List<Vuelo> vuelosDisponibles = vuelosPorOrigen
                    .getOrDefault(estado.aeropuertoActual, Collections.emptyList());

            for (Vuelo vuelo : vuelosDisponibles) {
                LocalDateTime proximaSalida = vuelo.getProximaSalidaGMT(estado.tiempoActual, tiempoEsperaEscala);
                java.time.LocalDate fechaLocal = proximaSalida.plusHours(vuelo.getOrigen().getGmt()).toLocalDate();
                String key = vuelo.getId() + ":" + fechaLocal.toString();

                if (vuelosCancelados != null && vuelosCancelados.contains(key)) continue;
                if (soloConCapacidad && vuelo.getCapacidadDisponible() <= 0) continue;

                LocalDateTime llegada       = vuelo.getLlegadaGMT(proximaSalida);

                if (llegada.isAfter(deadlineGMT)) continue;

                List<Vuelo> nuevaRuta = new ArrayList<>(estado.ruta);
                nuevaRuta.add(vuelo);

                if (vuelo.getDestino().getCodigo().equals(codigoDestino)) {
                    rutasEncontradas.add(nuevaRuta);
                } else {
                    cola.add(new BFSEstado(vuelo.getDestino().getCodigo(), llegada, nuevaRuta));
                }
            }
        }

        rutasEncontradas.sort(Comparator.comparingLong(r -> calcularTransitoMinutos(r, disponibleGMT)));
        return rutasEncontradas;
    }

    public List<List<Vuelo>> buscarRutasRelajadas(Envio envio, LocalDateTime minSalidaGMT) {
        return buscarRutas(envio, false, Collections.emptySet(), minSalidaGMT);
    }

    public List<List<Vuelo>> buscarRutasRelajadas(Envio envio, Set<String> vuelosCancelados, LocalDateTime minSalidaGMT) {
        return buscarRutas(envio, false, vuelosCancelados, minSalidaGMT);
    }

    // ── Utilidades ────────────────────────────────────────────────────────────

    public Aeropuerto getAeropuerto(String codigo) {
        return aeropuertos.get(codigo);
    }

    public Collection<Aeropuerto> getTodosAeropuertos() {
        return aeropuertos.values();
    }

    public List<Vuelo> getVuelosDesde(String codigoOrigen) {
        return vuelosPorOrigen.getOrDefault(codigoOrigen, Collections.emptyList());
    }

    public int getTotalVuelos() {
        return vuelosPorOrigen.values().stream().mapToInt(List::size).sum();
    }

    private long calcularTransitoMinutos(List<Vuelo> ruta, LocalDateTime recepcionGMT) {
        if (ruta.isEmpty()) return Long.MAX_VALUE;
        LocalDateTime t = recepcionGMT;
        for (Vuelo v : ruta) {
            LocalDateTime salida = v.getProximaSalidaGMT(t, tiempoEsperaEscala);
            t = v.getLlegadaGMT(salida);
        }
        return Duration.between(recepcionGMT, t).toMinutes();
    }

    private static class BFSEstado {
        final String          aeropuertoActual;
        final LocalDateTime   tiempoActual;
        final List<Vuelo>     ruta;

        BFSEstado(String aeropuertoActual, LocalDateTime tiempoActual, List<Vuelo> ruta) {
            this.aeropuertoActual = aeropuertoActual;
            this.tiempoActual     = tiempoActual;
            this.ruta             = ruta;
        }
    }

    public static int calcularCapacidadCuelloBotella(List<Vuelo> ruta) {
        if (ruta == null || ruta.isEmpty()) return 0;
        int min = Integer.MAX_VALUE;
        for (Vuelo v : ruta) {
            if (v.getCapacidadDisponible() < min) {
                min = v.getCapacidadDisponible();
            }
        }
        return min;
    }
}
