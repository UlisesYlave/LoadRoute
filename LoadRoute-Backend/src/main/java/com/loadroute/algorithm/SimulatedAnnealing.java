package com.loadroute.algorithm;

import com.loadroute.algorithm.graph.RedLogistica;
import com.loadroute.algorithm.model.Envio;
import com.loadroute.algorithm.model.SolucionEstado;
import com.loadroute.algorithm.model.Vuelo;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.logging.Logger;

/**
 * SIMULATED ANNEALING — v3 con reheats corregidos y vecindario mejorado.
 *
 * CORRECCIÓN v3: Reheat instantáneo
 * ──────────────────────────────────
 * v2 usaba T_reheat = T0 * 0.1^reheat = 100, 50, 25, 12.5, 6.25
 * Con alpha=0.995 y T_min=1.0, T=100 converge en ~919 pasos ≈ 46ms.
 * Resultado: 5 reheats completados en 200ms total sin exploración real.
 *
 * CORRECCIÓN: Los reheats parten de T_reheat proporcional al costo del problema,
 * no de T0 fija. Temperatura calibrada al costo promedio por envío para que la
 * probabilidad de aceptar un movimiento "malo" sea ~30% al inicio del reheat.
 *
 * CORRECCIÓN: Vecindario "swap de rutas" entre dos envíos
 * ────────────────────────────────────────────────────────
 * Con red sin congestión, cambiar la ruta de UN envío no mejora nada
 * porque el greedy ya asignó la ruta óptima para cada uno.
 * SOLUCIÓN: Se añade el operador "swap": intercambiar las rutas de dos
 * envíos con el mismo origen/destino. Esto permite descubrir si el
 * orden de asignación afecta la capacidad compartida entre vuelos.
 *
 * CORRECCIÓN: Temperatura inicial auto-calibrada
 * ───────────────────────────────────────────────
 * T0 se calibra automáticamente usando muestreo: se calculan 100 deltas
 * aleatorios y se elige T0 tal que la probabilidad de aceptar un movimiento
 * "malo" promedio sea ~0.5 al inicio. Esto garantiza exploración correcta
 * independientemente del tamaño del problema.
 */
public class SimulatedAnnealing {

    private static final Logger LOG = Logger.getLogger(SimulatedAnnealing.class.getName());

    // ── Parámetros ────────────────────────────────────────────────────────────
    private double temperaturaInicial = -1;  // -1 = auto-calibrar
    private double alfa               = 0.995;
    private double temperaturaMinima  = 0.01;
    private long   tiempoMaxMs        = 90L * 60 * 1_000;
    private int    maxReheats         = 5;

    private final Random rng;
    private final RedLogistica red;

    // ── Estadísticas ──────────────────────────────────────────────────────────
    private int    iteraciones;
    private int    reheats;
    private int    mejorasAceptadas;
    private int    peoresAceptadas;
    private int    cacheHits;
    private double costoInicial;
    private double costoFinal;

    public SimulatedAnnealing(RedLogistica red) {
        this.red = red;
        this.rng = new Random(42);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PUNTO DE ENTRADA
    // ══════════════════════════════════════════════════════════════════════════

    public SolucionEstado optimizar(Map<String, Envio> envios) {
        long inicio = System.currentTimeMillis();

        // 1. Solución inicial greedy
        SolucionEstado base = construirGreedy(envios);
        EstadoIncremental estado = new EstadoIncremental(base, envios);
        costoInicial = estado.costoTotal;

        SolucionEstado mejorSolucion = base.clonar();
        double mejorCosto = costoInicial;

        // 2. Auto-calibrar temperatura inicial
        double T0 = (temperaturaInicial > 0)
                ? temperaturaInicial
                : calibrarTemperatura(estado, envios);

        LOG.info(String.format("SA-Opt inicio | T0=%.1f | costo greedy: %.2f | envios: %d/%d",
                T0, costoInicial, base.getEnviosAsignados(), base.getTotalEnvios()));

        // 3. Caché de rutas por par origen-destino
        Map<String, List<List<Vuelo>>> cacheRutas = new HashMap<>(900);

        double temperatura = T0;
        iteraciones = 0; reheats = 0; mejorasAceptadas = 0;
        peoresAceptadas = 0; cacheHits = 0;

        do {
            while (temperatura > temperaturaMinima
                    && (System.currentTimeMillis() - inicio) < tiempoMaxMs) {

                // Alternar entre dos tipos de vecindario:
                // 50% - cambio de ruta de un envío (exploración individual)
                // 50% - swap de rutas entre dos envíos (exploración relacional)
                double delta;
                boolean aplicado;
                if (rng.nextBoolean()) {
                    delta = intentarCambioRuta(estado, envios, cacheRutas);
                } else {
                    delta = intentarSwapRutas(estado, envios);
                }

                // delta = Double.MAX_VALUE significa "no hay movimiento válido"
                if (delta == Double.MAX_VALUE) {
                    temperatura *= alfa;
                    iteraciones++;
                    continue;
                }

                boolean aceptar = delta < 0
                        || Math.exp(-delta / temperatura) > rng.nextDouble();

                if (aceptar) {
                    // El movimiento ya fue aplicado en intentar*()
                    if (delta < 0) mejorasAceptadas++;
                    else           peoresAceptadas++;

                    if (estado.costoTotal < mejorCosto) {
                        mejorSolucion = estado.exportar();
                        mejorCosto    = estado.costoTotal;
                    }
                } else {
                    // Revertir el movimiento aplicado
                    estado.revertirUltimoMovimiento(envios);
                }

                temperatura *= alfa;
                iteraciones++;
            }

            // Reheat desde la mejor solución con temperatura proporcional al costo actual
            if ((System.currentTimeMillis() - inicio) < tiempoMaxMs && reheats < maxReheats) {
                reheats++;
                // Temperatura del reheat decrece con cada reinicio (exploración más fina)
                temperatura = T0 * Math.pow(0.3, reheats);
                // Reiniciar desde la mejor solución encontrada
                estado = new EstadoIncremental(mejorSolucion, envios);
                LOG.info(String.format("SA-Opt reheat #%d | T=%.2f | costo: %.2f",
                        reheats, temperatura, mejorCosto));
            } else {
                break;
            }

        } while ((System.currentTimeMillis() - inicio) < tiempoMaxMs);

        costoFinal = mejorCosto;
        long ms = System.currentTimeMillis() - inicio;
        LOG.info(String.format(
            "SA-Opt fin | iter: %d | reheats: %d | mejoras: %d | peores: %d | " +
            "cache: %d hits | costo: %.2f -> %.2f (%.1f%%) | tiempo: %.1fs",
            iteraciones, reheats, mejorasAceptadas, peoresAceptadas,
            cacheHits, costoInicial, costoFinal, getMejoraRelativa(), ms / 1000.0));

        if (!mejorSolucion.esFactible()) {
            throw new RuntimeException("ERROR_CAPACIDAD: Imposible asignar los envíos sin causar desbordamientos en vuelos o aeropuertos.");
        }

        return mejorSolucion;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // OPERADORES DE VECINDARIO
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Operador 1: cambiar la ruta de un envío aleatorio.
     * Aplica el movimiento directamente y retorna el delta.
     * Si no hay movimiento válido, retorna Double.MAX_VALUE.
     */
    private double intentarCambioRuta(EstadoIncremental estado,
                                       Map<String, Envio> envios,
                                       Map<String, List<List<Vuelo>>> cache) {
        String idEnvio = estado.seleccionarEnvioAleatorio(rng);
        if (idEnvio == null) return Double.MAX_VALUE;

        Envio envio = envios.get(idEnvio);
        List<Vuelo> rutaActual = estado.getRuta(idEnvio);

        String cacheKey = envio.getOrigen().getCodigo() + "->" + envio.getDestino().getCodigo();
        List<List<Vuelo>> alternativas = cache.get(cacheKey);
        if (alternativas == null) {
            alternativas = red.buscarRutasRelajadas(envio);
            cache.put(cacheKey, alternativas);
        } else {
            cacheHits++;
        }

        List<Vuelo> rutaNueva = elegirAlternativa(alternativas, rutaActual);
        if (rutaNueva == null) return Double.MAX_VALUE;

        double delta = estado.calcularDeltaCambioRuta(idEnvio, rutaActual, rutaNueva, envio);
        estado.aplicarCambioRuta(idEnvio, rutaActual, rutaNueva, envio, delta);
        return delta;
    }

    /**
     * Operador 2: intercambiar las rutas de dos envíos con mismo origen y destino.
     * Útil cuando la red tiene congestión: el orden de asignación importa.
     * Aplica el movimiento directamente y retorna el delta.
     */
    private double intentarSwapRutas(EstadoIncremental estado, Map<String, Envio> envios) {
        // Seleccionar un envío semilla
        String idA = estado.seleccionarEnvioAleatorio(rng);
        if (idA == null) return Double.MAX_VALUE;

        Envio envioA = envios.get(idA);
        List<Vuelo> rutaA = estado.getRuta(idA);
        if (rutaA.isEmpty()) return Double.MAX_VALUE;

        // Buscar un segundo envío con el mismo origen y destino
        String idB = estado.seleccionarEnvioMismoParOD(rng, idA, envioA, envios);
        if (idB == null) return Double.MAX_VALUE;

        Envio envioB = envios.get(idB);
        List<Vuelo> rutaB = estado.getRuta(idB);

        // Si ambos tienen la misma ruta, el swap no cambia nada
        if (iguales(rutaA, rutaB)) return Double.MAX_VALUE;

        // Calcular delta del swap (A toma ruta de B, B toma ruta de A)
        double delta = estado.calcularDeltaSwap(idA, rutaA, rutaB, envioA, idB, rutaB, rutaA, envioB);
        estado.aplicarSwap(idA, rutaA, rutaB, envioA, idB, rutaB, rutaA, envioB, delta);
        return delta;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ESTADO INCREMENTAL
    // ══════════════════════════════════════════════════════════════════════════

    private class EstadoIncremental {

        final Map<String, Envio>       envios;
        final Map<String, List<Vuelo>> asignaciones;
        final Map<String, Long>        transitoHoras;
        final Map<String, Integer>     cargaPorVueloFecha;
        final ArrayList<String>        enviosConRuta;
        final Map<String, Integer>     indiceConRuta;
        double costoTotal;

        // Para revertir el último movimiento [OPT-2]
        private String  undoIdA, undoIdB;
        private List<Vuelo> undoRutaA, undoRutaB;
        private double  undoDelta;

        EstadoIncremental(SolucionEstado sol, Map<String, Envio> envios) {
            this.envios       = envios;
            this.asignaciones = new LinkedHashMap<>();
            this.transitoHoras = new HashMap<>();
            this.cargaPorVueloFecha = new HashMap<>();
            this.enviosConRuta = new ArrayList<>();
            this.indiceConRuta = new HashMap<>();

            for (Map.Entry<String, List<Vuelo>> e : sol.getAsignaciones().entrySet()) {
                String id = e.getKey();
                List<Vuelo> ruta = new ArrayList<>(e.getValue());
                asignaciones.put(id, ruta);

                if (!ruta.isEmpty()) {
                    indiceConRuta.put(id, enviosConRuta.size());
                    enviosConRuta.add(id);
                    Envio envio = envios.get(id);
                    if (envio != null) {
                        transitoHoras.put(id, calcularTransitoHoras(ruta, envio));
                        LocalDateTime t = envio.getRecepcionGMT();
                        for (Vuelo v : ruta) {
                            LocalDateTime salida = v.getProximaSalidaGMT(t, 30);
                            String key = v.getId() + "_" + salida.toLocalDate().toString();
                            cargaPorVueloFecha.merge(key, envio.getCantidadMaletas(), Integer::sum);
                            t = v.getLlegadaGMT(salida);
                        }
                    }
                }
            }
            this.costoTotal = calcularCostoCompleto();
        }

        // ── Delta costing para cambio de ruta ────────────────────────────────

        double calcularDeltaCambioRuta(String idEnvio, List<Vuelo> rutaVieja,
                                        List<Vuelo> rutaNueva, Envio envio) {
            long horasViejas = transitoHoras.getOrDefault(idEnvio, 0L);
            long horasNuevas = calcularTransitoHoras(rutaNueva, envio);
            int maletas = envio.getCantidadMaletas();
            int sla     = envio.getSlaHoras();

            double delta = (horasNuevas - horasViejas);
            delta += SolucionEstado.PESO_SLA * (Math.max(0, horasNuevas - sla) - Math.max(0, horasViejas - sla));

            // Restar costo de ruta vieja y modificar estado temporalmente
            LocalDateTime tViejo = envio.getRecepcionGMT();
            for (Vuelo v : rutaVieja) {
                LocalDateTime salida = v.getProximaSalidaGMT(tViejo, 30);
                java.time.LocalDate fecha = salida.toLocalDate();
                String key = v.getId() + "_" + fecha.toString();
                int c = cargaPorVueloFecha.getOrDefault(key, 0);
                int globalLoad = v.getCapacidadOcupada(fecha);
                delta -= SolucionEstado.PESO_CAPACIDAD_VUELO * Math.max(0, globalLoad + c - v.getCapacidadMax());
                cargaPorVueloFecha.put(key, c - maletas); // Aplicar temporal
                tViejo = v.getLlegadaGMT(salida);
            }

            // Sumar costo de ruta nueva
            LocalDateTime tNuevo = envio.getRecepcionGMT();
            for (Vuelo v : rutaNueva) {
                LocalDateTime salida = v.getProximaSalidaGMT(tNuevo, 30);
                java.time.LocalDate fecha = salida.toLocalDate();
                String key = v.getId() + "_" + fecha.toString();
                int c = cargaPorVueloFecha.getOrDefault(key, 0);
                int globalLoad = v.getCapacidadOcupada(fecha);
                delta += SolucionEstado.PESO_CAPACIDAD_VUELO * Math.max(0, globalLoad + c + maletas - v.getCapacidadMax());
                cargaPorVueloFecha.put(key, c + maletas); // Aplicar temporal
                tNuevo = v.getLlegadaGMT(salida);
            }

            // Restaurar estado temporal
            tNuevo = envio.getRecepcionGMT();
            for (Vuelo v : rutaNueva) {
                LocalDateTime salida = v.getProximaSalidaGMT(tNuevo, 30);
                String key = v.getId() + "_" + salida.toLocalDate().toString();
                cargaPorVueloFecha.put(key, cargaPorVueloFecha.get(key) - maletas);
                tNuevo = v.getLlegadaGMT(salida);
            }
            tViejo = envio.getRecepcionGMT();
            for (Vuelo v : rutaVieja) {
                LocalDateTime salida = v.getProximaSalidaGMT(tViejo, 30);
                String key = v.getId() + "_" + salida.toLocalDate().toString();
                cargaPorVueloFecha.put(key, cargaPorVueloFecha.get(key) + maletas);
                tViejo = v.getLlegadaGMT(salida);
            }

            return delta;
        }

        void aplicarCambioRuta(String idEnvio, List<Vuelo> rutaVieja,
                                List<Vuelo> rutaNueva, Envio envio, double delta) {
            // Guardar undo
            undoIdA   = idEnvio; undoRutaA = rutaVieja;
            undoIdB   = null;    undoRutaB = null;
            undoDelta = delta;

            int maletas = envio.getCantidadMaletas();
            LocalDateTime tViejo = envio.getRecepcionGMT();
            for (Vuelo v : rutaVieja) {
                LocalDateTime salida = v.getProximaSalidaGMT(tViejo, 30);
                String key = v.getId() + "_" + salida.toLocalDate().toString();
                cargaPorVueloFecha.merge(key, -maletas, Integer::sum);
                tViejo = v.getLlegadaGMT(salida);
            }
            LocalDateTime tNuevo = envio.getRecepcionGMT();
            for (Vuelo v : rutaNueva) {
                LocalDateTime salida = v.getProximaSalidaGMT(tNuevo, 30);
                String key = v.getId() + "_" + salida.toLocalDate().toString();
                cargaPorVueloFecha.merge(key, maletas, Integer::sum);
                tNuevo = v.getLlegadaGMT(salida);
            }
            transitoHoras.put(idEnvio, calcularTransitoHoras(rutaNueva, envio));
            asignaciones.put(idEnvio, rutaNueva);
            costoTotal += delta;
        }

        // ── Delta costing para swap de rutas ─────────────────────────────────

        double calcularDeltaSwap(String idA, List<Vuelo> rutaAVieja, List<Vuelo> rutaANueva,
                                  Envio envioA, String idB, List<Vuelo> rutaBVieja,
                                  List<Vuelo> rutaBNueva, Envio envioB) {
            double d = calcularDeltaCambioRuta(idA, rutaAVieja, rutaANueva, envioA);
            // Aplicar temporalmente A para calcular delta de B sobre el nuevo estado
            aplicarCambioRuta(idA, rutaAVieja, rutaANueva, envioA, d);
            double dB = calcularDeltaCambioRuta(idB, rutaBVieja, rutaBNueva, envioB);
            // Revertir A (se aplicará formalmente en aplicarSwap)
            aplicarCambioRuta(idA, rutaANueva, rutaAVieja, envioA, -d);
            return d + dB;
        }

        void aplicarSwap(String idA, List<Vuelo> rutaAVieja, List<Vuelo> rutaANueva, Envio envioA,
                          String idB, List<Vuelo> rutaBVieja, List<Vuelo> rutaBNueva, Envio envioB,
                          double delta) {
            undoIdA = idA; undoRutaA = rutaAVieja;
            undoIdB = idB; undoRutaB = rutaBVieja;
            undoDelta = delta;

            aplicarCambioRuta(idA, rutaAVieja, rutaANueva, envioA, 0);
            aplicarCambioRuta(idB, rutaBVieja, rutaBNueva, envioB, 0);
            costoTotal += delta; // actualizar costo con el delta total real
        }

        void revertirUltimoMovimiento(Map<String, Envio> envios) {
            if (undoIdA == null) return;
            List<Vuelo> actual = asignaciones.get(undoIdA);
            aplicarCambioRuta(undoIdA, actual, undoRutaA, envios.get(undoIdA), 0);
            if (undoIdB != null) {
                List<Vuelo> actualB = asignaciones.get(undoIdB);
                aplicarCambioRuta(undoIdB, actualB, undoRutaB, envios.get(undoIdB), 0);
            }
            costoTotal -= undoDelta;
            undoIdA = null; undoIdB = null;
        }

        // ── Selección ─────────────────────────────────────────────────────────

        String seleccionarEnvioAleatorio(Random rng) {
            if (enviosConRuta.isEmpty()) return null;
            return enviosConRuta.get(rng.nextInt(enviosConRuta.size()));
        }

        /** Selecciona un segundo envío con el mismo par origen-destino que idA. */
        String seleccionarEnvioMismoParOD(Random rng, String idA, Envio envioA,
                                           Map<String, Envio> todosEnvios) {
            String orig = envioA.getOrigen().getCodigo();
            String dest = envioA.getDestino().getCodigo();

            List<String> candidatos = new ArrayList<>();
            for (String id : enviosConRuta) {
                if (id.equals(idA)) continue;
                Envio e = todosEnvios.get(id);
                if (e != null && e.getOrigen().getCodigo().equals(orig)
                              && e.getDestino().getCodigo().equals(dest)) {
                    candidatos.add(id);
                }
            }
            if (candidatos.isEmpty()) return null;
            return candidatos.get(rng.nextInt(candidatos.size()));
        }

        List<Vuelo> getRuta(String id) {
            return asignaciones.getOrDefault(id, Collections.emptyList());
        }

        SolucionEstado exportar() {
            SolucionEstado sol = new SolucionEstado(envios);
            for (Map.Entry<String, List<Vuelo>> e : asignaciones.entrySet()) {
                if (!e.getValue().isEmpty()) sol.asignarRuta(e.getKey(), e.getValue());
            }
            return sol;
        }

        private double calcularCostoCompleto() {
            double costo = 0.0;
            for (Map.Entry<String, Long> e : transitoHoras.entrySet()) {
                Envio envio = envios.get(e.getKey());
                if (envio == null) continue;
                long horas = e.getValue();
                costo += horas;
                costo += SolucionEstado.PESO_SLA * Math.max(0, horas - envio.getSlaHoras());
            }
            for (Map.Entry<String, Integer> e : cargaPorVueloFecha.entrySet()) {
                String[] parts = e.getKey().split("_");
                int vueloId = Integer.parseInt(parts[0]);
                java.time.LocalDate fecha = java.time.LocalDate.parse(parts[1]);
                Vuelo v = buscarVuelo(vueloId);
                if (v != null) {
                    int globalLoad = v.getCapacidadOcupada(fecha);
                    costo += SolucionEstado.PESO_CAPACIDAD_VUELO
                           * Math.max(0, globalLoad + e.getValue() - v.getCapacidadMax());
                }
            }
            for (Map.Entry<String, List<Vuelo>> e : asignaciones.entrySet()) {
                if (e.getValue().isEmpty()) {
                    Envio envio = envios.get(e.getKey());
                    if (envio != null) costo += SolucionEstado.PESO_SLA * envio.getSlaHoras();
                }
            }
            return costo;
        }

        private Vuelo buscarVuelo(int id) {
            for (List<Vuelo> ruta : asignaciones.values()) {
                for (Vuelo v : ruta) { if (v.getId() == id) return v; }
            }
            return null;
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // AUTO-CALIBRACIÓN DE TEMPERATURA
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Calibra T0 muestreando 100 movimientos aleatorios.
     * T0 se elige para que P(aceptar movimiento malo promedio) ≈ 0.5 al inicio.
     * Fórmula: T0 = -delta_promedio / ln(0.5)
     */
    private double calibrarTemperatura(EstadoIncremental estado, Map<String, Envio> envios) {
        List<Double> deltasPositivos = new ArrayList<>();
        Map<String, List<List<Vuelo>>> cacheTemp = new HashMap<>();

        for (int i = 0; i < 100 && !estado.enviosConRuta.isEmpty(); i++) {
            String id = estado.seleccionarEnvioAleatorio(rng);
            if (id == null) continue;
            Envio envio = envios.get(id);
            if (envio == null) continue;
            List<Vuelo> rutaActual = estado.getRuta(id);

            String key = envio.getOrigen().getCodigo() + "->" + envio.getDestino().getCodigo();
            List<List<Vuelo>> alts = cacheTemp.computeIfAbsent(key, k -> red.buscarRutasRelajadas(envio));
            List<Vuelo> rutaNueva = elegirAlternativa(alts, rutaActual);
            if (rutaNueva == null) continue;

            double delta = estado.calcularDeltaCambioRuta(id, rutaActual, rutaNueva, envio);
            if (delta > 0) deltasPositivos.add(delta);
        }

        if (deltasPositivos.isEmpty()) {
            LOG.info("Auto-calibracion: no se encontraron movimientos peores. T0=10.0");
            return 10.0;
        }

        double deltaPromedio = deltasPositivos.stream().mapToDouble(d -> d).average().orElse(1.0);
        double T0 = -deltaPromedio / Math.log(0.5); // P(aceptar) = 0.5 para delta promedio
        T0 = Math.max(1.0, Math.min(T0, 10_000.0)); // acotar entre 1 y 10,000

        LOG.info(String.format("Auto-calibracion: delta_avg=%.2f -> T0=%.2f", deltaPromedio, T0));
        return T0;
    }

    // ── Utilidades ────────────────────────────────────────────────────────────

    static long calcularTransitoHoras(List<Vuelo> ruta, Envio envio) {
        if (ruta.isEmpty()) return envio.getSlaHoras() * 10L;
        LocalDateTime t = envio.getRecepcionGMT();
        for (Vuelo v : ruta) {
            t = v.getLlegadaGMT(v.getProximaSalidaGMT(t, RedLogistica.BUFFER_CONEXION));
        }
        return ChronoUnit.HOURS.between(envio.getRecepcionGMT(), t);
    }

    private SolucionEstado construirGreedy(Map<String, Envio> envios) {
        SolucionEstado sol = new SolucionEstado(envios);
        Map<Vuelo, Map<java.time.LocalDate, Integer>> reservasTemporales = new HashMap<>();

        for (Envio envio : envios.values()) {
            List<List<Vuelo>> rutas = red.buscarRutas(envio, true);
            if (rutas.isEmpty()) rutas = red.buscarRutasRelajadas(envio);
            if (!rutas.isEmpty()) {
                List<Vuelo> ruta = rutas.get(0);
                sol.asignarRuta(envio.getId(), ruta);
                
                LocalDateTime t = envio.getRecepcionGMT();
                for (Vuelo v : ruta) {
                    LocalDateTime salida = v.getProximaSalidaGMT(t, 30);
                    java.time.LocalDate fecha = salida.toLocalDate();
                    v.reservar(fecha, envio.getCantidadMaletas());
                    reservasTemporales.computeIfAbsent(v, k -> new HashMap<>())
                            .merge(fecha, envio.getCantidadMaletas(), Integer::sum);
                    t = v.getLlegadaGMT(salida);
                }
            }
        }
        
        // Liberar las reservas temporales para que SA use evaluarCostoTotal sin ensuciar estado global
        for (Map.Entry<Vuelo, Map<java.time.LocalDate, Integer>> entry : reservasTemporales.entrySet()) {
            Vuelo v = entry.getKey();
            for (Map.Entry<java.time.LocalDate, Integer> diaReserva : entry.getValue().entrySet()) {
                v.liberar(diaReserva.getKey(), diaReserva.getValue());
            }
        }
        return sol;
    }

    private List<Vuelo> elegirAlternativa(List<List<Vuelo>> alts, List<Vuelo> actual) {
        if (alts.isEmpty()) return null;
        List<List<Vuelo>> distintas = new ArrayList<>();
        for (List<Vuelo> r : alts) { if (!iguales(r, actual)) distintas.add(r); }
        if (distintas.isEmpty()) return null;
        return distintas.get(rng.nextInt(distintas.size()));
    }

    private boolean iguales(List<Vuelo> r1, List<Vuelo> r2) {
        if (r1.size() != r2.size()) return false;
        for (int i = 0; i < r1.size(); i++) {
            if (r1.get(i).getId() != r2.get(i).getId()) return false;
        }
        return true;
    }

    // ── Configuración ─────────────────────────────────────────────────────────
    public SimulatedAnnealing setTemperaturaInicial(double t) { this.temperaturaInicial = t; return this; }
    public SimulatedAnnealing setAlfa(double a)               { this.alfa = a; return this; }
    public SimulatedAnnealing setTemperaturaMinima(double t)  { this.temperaturaMinima = t; return this; }
    public SimulatedAnnealing setTiempoMaxMinutos(long min)   { this.tiempoMaxMs = min * 60_000L; return this; }
    public SimulatedAnnealing setMaxReheats(int n)            { this.maxReheats = n; return this; }

    // ── Estadísticas ──────────────────────────────────────────────────────────
    public int    getIteraciones()      { return iteraciones; }
    public int    getReheats()          { return reheats; }
    public int    getMejorasAceptadas() { return mejorasAceptadas; }
    public int    getPeoresAceptadas()  { return peoresAceptadas; }
    public double getCostoInicial()     { return costoInicial; }
    public double getCostoFinal()       { return costoFinal; }
    public double getMejoraRelativa() {
        return costoInicial == 0 ? 0 : (costoInicial - costoFinal) / costoInicial * 100.0;
    }
}
