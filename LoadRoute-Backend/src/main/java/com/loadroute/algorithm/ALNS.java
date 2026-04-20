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
 * ADAPTIVE LARGE NEIGHBORHOOD SEARCH (ALNS) — Implementación real para Tasf.B2B
 *
 * Operadores de Destrucción:
 *   D1 - Random Removal, D2 - Worst Removal, D3 - Related Removal
 * Operadores de Reparación:
 *   R1 - Greedy Insertion, R2 - Regret-2 Insertion
 */
public class ALNS {

    private static final Logger LOG = Logger.getLogger(ALNS.class.getName());

    private int    maxIteraciones    = 500;
    private double gradoDestruccion  = 0.20;
    private double temperaturaInicial = 100.0;
    private double alfa              = 0.990;
    private double tasaActualizacion = 0.15;
    private long   tiempoMaxMs       = 90L * 60 * 1_000;

    private static final double SIGMA_MEJOR_GLOBAL = 3.0;
    private static final double SIGMA_MEJORA_LOCAL  = 2.0;
    private static final double SIGMA_ACEPTADO_SA   = 1.0;

    private final Random rng;
    private final RedLogistica red;

    private final double[] pesosDestruccion = { 1.0, 1.0, 1.0 };
    private final double[] pesosReparacion  = { 1.0, 1.0 };

    private int    iteraciones;
    private double costoInicial;
    private double costoFinal;

    public ALNS(RedLogistica red) {
        this.red = red;
        this.rng = new Random(42);
    }

    public SolucionEstado replanificarColapso(SolucionEstado solucionActual,
                                              List<Vuelo> vuelosCancelados,
                                              Map<String, Envio> todosLosEnvios) {
        Set<Integer>  idsCancelados = new HashSet<>();
        for (Vuelo v : vuelosCancelados) idsCancelados.add(v.getId());

        List<String> afectados = new ArrayList<>();
        for (Map.Entry<String, List<Vuelo>> e : solucionActual.getAsignaciones().entrySet()) {
            for (Vuelo v : e.getValue()) {
                if (idsCancelados.contains(v.getId())) {
                    afectados.add(e.getKey());
                    break;
                }
            }
        }

        LOG.info(String.format("ALNS colapso: %d vuelos cancelados → %d envíos afectados",
                vuelosCancelados.size(), afectados.size()));

        SolucionEstado inicio = solucionActual.clonar();
        for (String id : afectados) inicio.removerRuta(id);

        return ejecutarALNS(inicio, todosLosEnvios, afectados);
    }

    public SolucionEstado optimizar(Map<String, Envio> envios,
                                    SolucionEstado solucionInicial) {
        List<String> todosIds = new ArrayList<>(envios.keySet());
        return ejecutarALNS(solucionInicial, envios, todosIds);
    }

    private SolucionEstado ejecutarALNS(SolucionEstado solucionActual,
                                         Map<String, Envio> envios,
                                         List<String> idsCandidatos) {
        long inicio = System.currentTimeMillis();

        SolucionEstado mejor  = solucionActual.clonar();
        double mejorCosto     = mejor.evaluarCostoTotal();
        double costoActual    = mejorCosto;
        costoInicial          = mejorCosto;

        double temperatura = temperaturaInicial;
        iteraciones = 0;

        int q = Math.max(1, (int) (idsCandidatos.size() * gradoDestruccion));

        while (iteraciones < maxIteraciones
                && (System.currentTimeMillis() - inicio) < tiempoMaxMs) {

            int opD = seleccionarPorRuleta(pesosDestruccion);
            int opR = seleccionarPorRuleta(pesosReparacion);

            SolucionEstado rota = destruir(solucionActual.clonar(), idsCandidatos, q, opD, envios);
            SolucionEstado reparada = reparar(rota, envios, opR);

            double costoReparado = reparada.evaluarCostoTotal();
            double delta = costoReparado - costoActual;

            double puntaje;
            boolean aceptar = delta < 0 || Math.exp(-delta / temperatura) > rng.nextDouble();

            if (costoReparado < mejorCosto) {
                mejor      = reparada.clonar();
                mejorCosto = costoReparado;
                puntaje    = SIGMA_MEJOR_GLOBAL;
            } else if (delta < 0) {
                puntaje = SIGMA_MEJORA_LOCAL;
            } else if (aceptar) {
                puntaje = SIGMA_ACEPTADO_SA;
            } else {
                puntaje = 0.0;
            }

            if (aceptar) {
                solucionActual = reparada;
                costoActual    = costoReparado;
            }

            actualizarPeso(pesosDestruccion, opD, puntaje);
            actualizarPeso(pesosReparacion,  opR, puntaje);

            temperatura *= alfa;
            iteraciones++;
        }

        costoFinal = mejorCosto;
        long tiempoTotal = System.currentTimeMillis() - inicio;
        LOG.info(String.format("ALNS fin → iter: %d | costo: %.2f → %.2f | tiempo: %d s",
                iteraciones, costoInicial, costoFinal, tiempoTotal / 1000));

        return mejor;
    }

    // ── Operadores de Destrucción ─────────────────────────────────────────────

    private SolucionEstado destruir(SolucionEstado sol, List<String> candidatos,
                                     int q, int op, Map<String, Envio> envios) {
        switch (op) {
            case 0: return destruccionAleatoria(sol, candidatos, q);
            case 1: return destruccionPeores(sol, candidatos, q, envios);
            case 2: return destruccionRelacionada(sol, candidatos, q, envios);
            default: return destruccionAleatoria(sol, candidatos, q);
        }
    }

    private SolucionEstado destruccionAleatoria(SolucionEstado sol, List<String> candidatos, int q) {
        List<String> copia = new ArrayList<>(candidatos);
        Collections.shuffle(copia, rng);
        for (int i = 0; i < Math.min(q, copia.size()); i++) {
            sol.removerRuta(copia.get(i));
        }
        return sol;
    }

    private SolucionEstado destruccionPeores(SolucionEstado sol, List<String> candidatos,
                                              int q, Map<String, Envio> envios) {
        List<Map.Entry<String, Double>> costos = new ArrayList<>();
        for (String id : candidatos) {
            List<Vuelo> ruta = sol.getRuta(id);
            if (ruta.isEmpty()) continue;
            Envio envio = envios.get(id);
            LocalDateTime t = envio.getRecepcionGMT();
            for (Vuelo v : ruta) {
                LocalDateTime sal = v.getProximaSalidaGMT(t, RedLogistica.BUFFER_CONEXION);
                t = v.getLlegadaGMT(sal);
            }
            long minutos = ChronoUnit.MINUTES.between(envio.getRecepcionGMT(), t);
            costos.add(new AbstractMap.SimpleEntry<>(id, (double) minutos));
        }
        costos.sort((a, b) -> Double.compare(b.getValue(), a.getValue()));

        for (int i = 0; i < Math.min(q, costos.size()); i++) {
            sol.removerRuta(costos.get(i).getKey());
        }
        return sol;
    }

    private SolucionEstado destruccionRelacionada(SolucionEstado sol, List<String> candidatos,
                                                   int q, Map<String, Envio> envios) {
        if (candidatos.isEmpty()) return sol;
        String semillaId = candidatos.get(rng.nextInt(candidatos.size()));
        Envio semilla = envios.get(semillaId);

        List<String> relacionados = new ArrayList<>();
        for (String id : candidatos) {
            Envio e = envios.get(id);
            if (e.getOrigen().getCodigo().equals(semilla.getOrigen().getCodigo())
                || e.getDestino().getCodigo().equals(semilla.getDestino().getCodigo())) {
                relacionados.add(id);
            }
        }
        Collections.shuffle(relacionados, rng);

        for (int i = 0; i < Math.min(q, relacionados.size()); i++) {
            sol.removerRuta(relacionados.get(i));
        }
        return sol;
    }

    // ── Operadores de Reparación ──────────────────────────────────────────────

    private SolucionEstado reparar(SolucionEstado sol, Map<String, Envio> envios, int op) {
        switch (op) {
            case 0: return reparacionGreedy(sol, envios);
            case 1: return reparacionRegret(sol, envios);
            default: return reparacionGreedy(sol, envios);
        }
    }

    private SolucionEstado reparacionGreedy(SolucionEstado sol, Map<String, Envio> envios) {
        List<String> huerfanos = sol.getEnviosSinRuta();
        for (String id : huerfanos) {
            Envio envio = envios.get(id);
            List<List<Vuelo>> rutas = red.buscarRutas(envio, true);
            if (rutas.isEmpty()) rutas = red.buscarRutasRelajadas(envio);
            if (!rutas.isEmpty()) {
                sol.asignarRuta(id, rutas.get(0));
            }
        }
        return sol;
    }

    private SolucionEstado reparacionRegret(SolucionEstado sol, Map<String, Envio> envios) {
        List<String> huerfanos = new ArrayList<>(sol.getEnviosSinRuta());

        List<Map.Entry<String, Double>> regrets = new ArrayList<>();
        Map<String, List<List<Vuelo>>> rutasPorEnvio = new HashMap<>();

        for (String id : huerfanos) {
            Envio envio = envios.get(id);
            List<List<Vuelo>> rutas = red.buscarRutas(envio, true);
            if (rutas.isEmpty()) rutas = red.buscarRutasRelajadas(envio);
            rutasPorEnvio.put(id, rutas);

            double regret;
            if (rutas.size() >= 2) {
                double costo1 = costoRuta(rutas.get(0), envio);
                double costo2 = costoRuta(rutas.get(1), envio);
                regret = costo2 - costo1;
            } else {
                regret = Double.MAX_VALUE;
            }
            regrets.add(new AbstractMap.SimpleEntry<>(id, regret));
        }

        regrets.sort((a, b) -> Double.compare(b.getValue(), a.getValue()));

        for (Map.Entry<String, Double> e : regrets) {
            String id = e.getKey();
            List<List<Vuelo>> rutas = rutasPorEnvio.get(id);
            if (rutas != null && !rutas.isEmpty()) {
                sol.asignarRuta(id, rutas.get(0));
            }
        }
        return sol;
    }

    // ── Utilidades ────────────────────────────────────────────────────────────

    private int seleccionarPorRuleta(double[] pesos) {
        double suma = 0;
        for (double p : pesos) suma += p;
        double r = rng.nextDouble() * suma;
        double acum = 0;
        for (int i = 0; i < pesos.length; i++) {
            acum += pesos[i];
            if (r <= acum) return i;
        }
        return pesos.length - 1;
    }

    private void actualizarPeso(double[] pesos, int idx, double puntaje) {
        pesos[idx] = (1 - tasaActualizacion) * pesos[idx]
                     + tasaActualizacion * puntaje;
        if (pesos[idx] < 0.01) pesos[idx] = 0.01;
    }

    private double costoRuta(List<Vuelo> ruta, Envio envio) {
        if (ruta.isEmpty()) return Double.MAX_VALUE;
        LocalDateTime t = envio.getRecepcionGMT();
        for (Vuelo v : ruta) {
            LocalDateTime sal = v.getProximaSalidaGMT(t, RedLogistica.BUFFER_CONEXION);
            t = v.getLlegadaGMT(sal);
        }
        return ChronoUnit.MINUTES.between(envio.getRecepcionGMT(), t);
    }

    // ── Configuración ─────────────────────────────────────────────────────────

    public ALNS setMaxIteraciones(int n)           { this.maxIteraciones = n; return this; }
    public ALNS setGradoDestruccion(double g)      { this.gradoDestruccion = g; return this; }
    public ALNS setTemperaturaInicial(double t)    { this.temperaturaInicial = t; return this; }
    public ALNS setTiempoMaxMinutos(long min)      { this.tiempoMaxMs = min * 60_000L; return this; }

    // ── Estadísticas ──────────────────────────────────────────────────────────

    public int    getIteraciones()    { return iteraciones; }
    public double getCostoInicial()   { return costoInicial; }
    public double getCostoFinal()     { return costoFinal; }
    public double getMejoraRelativa() { return costoInicial == 0 ? 0 : (costoInicial - costoFinal) / costoInicial * 100.0; }
    public double[] getPesosDestruccion() { return pesosDestruccion.clone(); }
    public double[] getPesosReparacion()  { return pesosReparacion.clone(); }
}
