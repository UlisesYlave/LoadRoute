package com.loadroute.algorithm.model;

/**
 * Representa un aeropuerto del sistema Tasf.B2B (modelo algorítmico, sin JPA).
 *
 * Fuente de datos: c_1inf54_26_1_v1_Aeropuerto_husos_v1_20250818__estudiantes.txt
 *
 * El campo gmt es crítico: permite normalizar los tiempos de salida/llegada
 * de vuelos a UTC para calcular correctamente el SLA intercontinental (48h)
 * vs. intracontinental (24h).
 */
public class Aeropuerto {

    private String codigo;       // Código IATA, ej. SKBO, VIDP
    private String ciudad;
    private String pais;
    private String continente;   // "america_sur" | "europa" | "asia"
    private int    gmt;          // Desplazamiento GMT en horas, ej. -5, +3
    private int    capacidadMax; // Capacidad de almacén (400-480 maletas)
    private double latitud;
    private double longitud;

    public Aeropuerto() {}

    public Aeropuerto(String codigo, String ciudad, String pais, String continente,
                      int gmt, int capacidadMax, double latitud, double longitud) {
        this.codigo       = codigo;
        this.ciudad       = ciudad;
        this.pais         = pais;
        this.continente   = continente;
        this.gmt          = gmt;
        this.capacidadMax = capacidadMax;
        this.latitud      = latitud;
        this.longitud     = longitud;
    }

    /** Determina si este aeropuerto está en el mismo continente que otro. */
    public boolean mismoContinente(Aeropuerto otro) {
        return this.continente != null && this.continente.equals(otro.getContinente());
    }

    // ── Getters ───────────────────────────────────────────────────────────────

    public String getCodigo()       { return codigo; }
    public String getCiudad()       { return ciudad; }
    public String getPais()         { return pais; }
    public String getContinente()   { return continente; }
    public int    getGmt()          { return gmt; }
    public int    getCapacidadMax() { return capacidadMax; }
    public double getLatitud()      { return latitud; }
    public double getLongitud()     { return longitud; }

    // ── Setters ───────────────────────────────────────────────────────────────

    public void setCodigo(String codigo)           { this.codigo = codigo; }
    public void setCiudad(String ciudad)           { this.ciudad = ciudad; }
    public void setPais(String pais)               { this.pais = pais; }
    public void setContinente(String continente)   { this.continente = continente; }
    public void setGmt(int gmt)                    { this.gmt = gmt; }
    public void setCapacidadMax(int capacidadMax)  { this.capacidadMax = capacidadMax; }
    public void setLatitud(double latitud)         { this.latitud = latitud; }
    public void setLongitud(double longitud)       { this.longitud = longitud; }

    @Override
    public String toString() {
        return String.format("Aeropuerto{%s - %s, GMT%+d, cap=%d}",
                codigo, ciudad, gmt, capacidadMax);
    }
}
