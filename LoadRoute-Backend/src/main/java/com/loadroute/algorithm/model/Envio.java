package com.loadroute.algorithm.model;

import java.time.LocalDateTime;

/**
 * Representa un envío (lote de maletas) registrado en un aeropuerto.
 *
 * Fuente de datos: _envios_VIDP_.txt  (y análogos por aeropuerto)
 * Formato: {id}-{aaaammdd}-{hh}-{mm}-{DEST}-{###}-{IdCliente}
 *
 * SLA:
 *   · Mismo continente      → 24 horas máximo de tránsito
 *   · Distinto continente   → 48 horas máximo de tránsito
 *   Todo tiempo se compara en GMT para ser preciso.
 */
public class Envio {

    private String         id;
    private String         idCliente;
    private Aeropuerto     origen;
    private Aeropuerto     destino;
    /** Hora LOCAL en el aeropuerto de origen. */
    private LocalDateTime  fechaHoraRecepcion;
    private int            cantidadMaletas;

    public Envio() {}

    public Envio(String id, String idCliente, Aeropuerto origen, Aeropuerto destino,
                 LocalDateTime fechaHoraRecepcion, int cantidadMaletas) {
        this.id                  = id;
        this.idCliente           = idCliente;
        this.origen              = origen;
        this.destino             = destino;
        this.fechaHoraRecepcion  = fechaHoraRecepcion;
        this.cantidadMaletas     = cantidadMaletas;
    }

    // ── Métodos de negocio ───────────────────────────────────────────────────

    public LocalDateTime getRecepcionGMT() {
        return fechaHoraRecepcion.minusHours(origen.getGmt());
    }

    public int getSlaHoras() {
        return origen.mismoContinente(destino) ? 24 : 48;
    }

    public LocalDateTime getDeadlineGMT() {
        return getRecepcionGMT().plusHours(getSlaHoras());
    }

    // ── Getters / Setters ────────────────────────────────────────────────────

    public String        getId()                    { return id; }
    public String        getIdCliente()             { return idCliente; }
    public Aeropuerto    getOrigen()                { return origen; }
    public Aeropuerto    getDestino()               { return destino; }
    public LocalDateTime getFechaHoraRecepcion()    { return fechaHoraRecepcion; }
    public int           getCantidadMaletas()       { return cantidadMaletas; }

    public void setId(String id)                             { this.id = id; }
    public void setIdCliente(String idCliente)               { this.idCliente = idCliente; }
    public void setOrigen(Aeropuerto origen)                 { this.origen = origen; }
    public void setDestino(Aeropuerto destino)               { this.destino = destino; }
    public void setFechaHoraRecepcion(LocalDateTime f)       { this.fechaHoraRecepcion = f; }
    public void setCantidadMaletas(int cantidadMaletas)      { this.cantidadMaletas = cantidadMaletas; }

    @Override
    public String toString() {
        return String.format("Envio{%s, %s→%s, %d maletas, SLA=%dh, cliente=%s}",
                id, origen.getCodigo(), destino.getCodigo(),
                cantidadMaletas, getSlaHoras(), idCliente);
    }
}
