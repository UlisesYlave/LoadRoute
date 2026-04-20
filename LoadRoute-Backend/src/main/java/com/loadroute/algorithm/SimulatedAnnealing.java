package com.loadroute.algorithm;

import com.loadroute.algorithm.graph.RedLogistica;
import com.loadroute.algorithm.model.Envio;
import com.loadroute.algorithm.model.SolucionEstado;
import com.loadroute.algorithm.model.Vuelo;

import java.util.*;
import java.util.logging.Logger;

/**
 * SIMULATED ANNEALING — Implementación real para Tasf.B2B
 *
 * Usado en: Escenario 1 (Operación en tiempo real, día a día).
 *
 * Algoritmo:
 *   1. Solución inicial greedy: para cada envío, asignar la ruta más rápida
 *      con capacidad disponible (BFS ordenado por tiempo de llegada).
 *   2. Bucle de enfriamiento:
 *      a. Seleccionar un envío al azar.
 *      b. Buscar una ruta alternativa (diferente a la actual).
 *      c. Evaluar el cambio de costo Δf.
 *      d. Aceptar si Δf < 0, o con probabilidad e^(-Δf/T) si Δf ≥ 0.
 *      e. Reducir temperatura: T ← T * α.
 *   3. Retornar la mejor solución encontrada.
 */
public class SimulatedAnnealing {

    private static final Logger LOG = Logger.getLogger(SimulatedAnnealing.class.getName());

    private double temperaturaInicial = 1_000.0;
    private double alfa               = 0.995;
    private double temperaturaMinima  = 1.0;
    private long   tiempoMaxMs        = 90L * 60 * 1_000;

    private final Random rng;
    private final RedLogistica red;

    private int    iteraciones;
    private int    mejorasAceptadas;
    private int    peoresAceptadas;
    private double costoInicial;
    private double costoFinal;

    public SimulatedAnnealing(RedLogistica red) {
        this.red = red;
        this.rng = new Random(42);
    }

    public SimulatedAnnealing(RedLogistica red, long semilla) {
        this.red = red;
        this.rng = new Random(semilla);
    }

    public SolucionEstado optimizar(Map<String, Envio> envios) {
        long inicio = System.currentTimeMillis();

        SolucionEstado actual = construirSolucionGreedy(envios);
        SolucionEstado mejor  = actual.clonar();

        costoInicial = actual.evaluarCostoTotal();
        double costoActual = costoInicial;
        double mejorCosto  = costoInicial;

        LOG.info(String.format("SA inicio → costo greedy: %.2f | asignados: %d/%d",
                costoInicial, actual.getEnviosAsignados(), actual.getTotalEnvios()));

        double temperatura = temperaturaInicial;
        iteraciones = 0; mejorasAceptadas = 0; peoresAceptadas = 0;

        while (temperatura > temperaturaMinima
                && (System.currentTimeMillis() - inicio) < tiempoMaxMs) {

            String idEnvio = actual.seleccionarEnvioAleatorio(rng);
            if (idEnvio == null) break;

            Envio envio = envios.get(idEnvio);
            List<Vuelo> rutaActual = actual.getRuta(idEnvio);

            List<List<Vuelo>> alternativas = red.buscarRutasRelajadas(envio);
            List<Vuelo> rutaAlternativa = elegirAlternativa(alternativas, rutaActual);
            if (rutaAlternativa == null) { temperatura *= alfa; continue; }

            SolucionEstado vecino = actual.clonar();
            vecino.asignarRuta(idEnvio, rutaAlternativa);
            double costoVecino = vecino.evaluarCostoTotal();
            double delta       = costoVecino - costoActual;

            if (delta < 0 || Math.exp(-delta / temperatura) > rng.nextDouble()) {
                actual      = vecino;
                costoActual = costoVecino;
                if (delta < 0) mejorasAceptadas++;
                else           peoresAceptadas++;

                if (costoActual < mejorCosto) {
                    mejor      = actual.clonar();
                    mejorCosto = costoActual;
                }
            }

            temperatura *= alfa;
            iteraciones++;
        }

        costoFinal = mejorCosto;
        long tiempoTotal = System.currentTimeMillis() - inicio;
        LOG.info(String.format(
                "SA fin → iteraciones: %d | mejoras: %d | peores aceptados: %d | " +
                "costo: %.2f → %.2f | tiempo: %d s",
                iteraciones, mejorasAceptadas, peoresAceptadas,
                costoInicial, costoFinal, tiempoTotal / 1000));

        return mejor;
    }

    private SolucionEstado construirSolucionGreedy(Map<String, Envio> envios) {
        SolucionEstado sol = new SolucionEstado(envios);

        for (Envio envio : envios.values()) {
            List<List<Vuelo>> rutas = red.buscarRutas(envio, true);
            if (rutas.isEmpty()) {
                rutas = red.buscarRutasRelajadas(envio);
            }
            if (!rutas.isEmpty()) {
                sol.asignarRuta(envio.getId(), rutas.get(0));
                for (Vuelo v : rutas.get(0)) {
                    v.reservar(envio.getCantidadMaletas());
                }
            }
        }
        return sol;
    }

    private List<Vuelo> elegirAlternativa(List<List<Vuelo>> alternativas, List<Vuelo> rutaActual) {
        if (alternativas.isEmpty()) return null;

        List<List<Vuelo>> distintas = new ArrayList<>();
        for (List<Vuelo> r : alternativas) {
            if (!iguales(r, rutaActual)) distintas.add(r);
        }
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

    // ── Configuración de parámetros ───────────────────────────────────────────

    public SimulatedAnnealing setTemperaturaInicial(double t)  { this.temperaturaInicial = t; return this; }
    public SimulatedAnnealing setAlfa(double alfa)             { this.alfa = alfa; return this; }
    public SimulatedAnnealing setTemperaturaMinima(double tMin){ this.temperaturaMinima = tMin; return this; }
    public SimulatedAnnealing setTiempoMaxMinutos(long min)    { this.tiempoMaxMs = min * 60_000L; return this; }

    // ── Estadísticas ──────────────────────────────────────────────────────────

    public int    getIteraciones()      { return iteraciones; }
    public int    getMejorasAceptadas() { return mejorasAceptadas; }
    public int    getPeoresAceptadas()  { return peoresAceptadas; }
    public double getCostoInicial()     { return costoInicial; }
    public double getCostoFinal()       { return costoFinal; }
    public double getMejoraRelativa()   { return costoInicial == 0 ? 0 : (costoInicial - costoFinal) / costoInicial * 100.0; }

    @Override
    public String toString() {
        return String.format("SimulatedAnnealing{T0=%.1f, α=%.4f, Tmin=%.1f, tmax=%d min}",
                temperaturaInicial, alfa, temperaturaMinima, tiempoMaxMs / 60_000);
    }
}
