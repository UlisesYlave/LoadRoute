package com.loadroute.algorithm.model;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Representa un vuelo dentro de la red logística de Tasf.B2B.
 *
 * Fuente de datos: planes_vuelo.txt
 * Formato de línea: ORIG-DEST-HH:MM-HH:MM-CCCC
 *   · Las horas son LOCALES en el aeropuerto correspondiente.
 *   · CCCC es la capacidad máxima del vuelo (150-400 maletas).
 *
 * Normalización GMT:
 *   salidaGMT  = horaSalidaLocal  - origen.gmt  (en horas)
 *   llegadaGMT = horaLlegadaLocal - destino.gmt (en horas)
 *   Si llegadaGMT < salidaGMT → el vuelo cruza medianoche GMT → llegadaGMT += 24h
 */
public class Vuelo {

    private static final AtomicInteger CONTADOR = new AtomicInteger(0);

    private final int     id;
    private Aeropuerto    origen;
    private Aeropuerto    destino;
    private LocalTime     horaSalidaLocal;
    private LocalTime     horaLlegadaLocal;
    private int           capacidadMax;
    private int           capacidadOcupada;

    public Vuelo() {
        this.id = CONTADOR.incrementAndGet();
    }

    public Vuelo(Aeropuerto origen, Aeropuerto destino,
                 LocalTime horaSalidaLocal, LocalTime horaLlegadaLocal,
                 int capacidadMax) {
        this.id               = CONTADOR.incrementAndGet();
        this.origen           = origen;
        this.destino          = destino;
        this.horaSalidaLocal  = horaSalidaLocal;
        this.horaLlegadaLocal = horaLlegadaLocal;
        this.capacidadMax     = capacidadMax;
        this.capacidadOcupada = 0;
    }

    /** Resetea el contador global de IDs (útil entre ejecuciones). */
    public static void resetContador() {
        CONTADOR.set(0);
    }

    // ── Métodos de normalización GMT ─────────────────────────────────────────

    public int getSalidaMinutosGMT() {
        int minutos = (horaSalidaLocal.getHour() * 60 + horaSalidaLocal.getMinute())
                      - (origen.getGmt() * 60);
        return ((minutos % 1440) + 1440) % 1440;
    }

    public int getLlegadaMinutosGMT() {
        int llegadaRaw = (horaLlegadaLocal.getHour() * 60 + horaLlegadaLocal.getMinute())
                         - (destino.getGmt() * 60);
        int llegadaGMT = ((llegadaRaw % 1440) + 1440) % 1440;
        if (llegadaGMT < getSalidaMinutosGMT()) {
            llegadaGMT += 1440;
        }
        return llegadaGMT;
    }

    public LocalDateTime getProximaSalidaGMT(LocalDateTime despues, int bufferMinutos) {
        LocalDateTime minDisponible = despues.plusMinutes(bufferMinutos);
        int salidaMin = getSalidaMinutosGMT();
        LocalDateTime candidato = minDisponible.toLocalDate()
                .atStartOfDay()
                .plusMinutes(salidaMin);
        if (!candidato.isBefore(minDisponible)) {
            return candidato;
        }
        return candidato.plusDays(1);
    }

    public LocalDateTime getLlegadaGMT(LocalDateTime salidaGMT) {
        int duracionMin = getLlegadaMinutosGMT() - getSalidaMinutosGMT();
        return salidaGMT.plusMinutes(duracionMin);
    }

    public int getDuracionMinutos() {
        return getLlegadaMinutosGMT() - getSalidaMinutosGMT();
    }

    // ── Gestión de capacidad ─────────────────────────────────────────────────

    public int  getCapacidadDisponible()    { return capacidadMax - capacidadOcupada; }
    public boolean tieneCapacidad(int n)    { return capacidadOcupada + n <= capacidadMax; }
    public void reservar(int n)             { capacidadOcupada += n; }
    public void liberar(int n)              { capacidadOcupada = Math.max(0, capacidadOcupada - n); }

    // ── Getters / Setters ────────────────────────────────────────────────────

    public int          getId()                 { return id; }
    public Aeropuerto   getOrigen()             { return origen; }
    public Aeropuerto   getDestino()            { return destino; }
    public LocalTime    getHoraSalidaLocal()    { return horaSalidaLocal; }
    public LocalTime    getHoraLlegadaLocal()   { return horaLlegadaLocal; }
    public int          getCapacidadMax()       { return capacidadMax; }
    public int          getCapacidadOcupada()   { return capacidadOcupada; }

    public void setOrigen(Aeropuerto o)             { this.origen = o; }
    public void setDestino(Aeropuerto d)            { this.destino = d; }
    public void setHoraSalidaLocal(LocalTime t)     { this.horaSalidaLocal = t; }
    public void setHoraLlegadaLocal(LocalTime t)    { this.horaLlegadaLocal = t; }
    public void setCapacidadMax(int c)              { this.capacidadMax = c; }
    public void setCapacidadOcupada(int c)          { this.capacidadOcupada = c; }

    @Override
    public String toString() {
        return String.format("Vuelo{id=%d, %s→%s, sal=%s(GMT%+d), cap=%d/%d}",
                id, origen.getCodigo(), destino.getCodigo(),
                horaSalidaLocal, origen.getGmt(), capacidadOcupada, capacidadMax);
    }
}
