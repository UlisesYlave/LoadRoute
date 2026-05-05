package com.loadroute.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

/**
 * DTO para la respuesta de los endpoints de ruteo.
 * Contiene resultados reales del algoritmo con métricas de rendimiento.
 */
public class RutaResponseDTO {

    @JsonProperty("escenario")
    private int escenario;

    @JsonProperty("resultadoSA")
    private ResultadoAlgoritmo resultadoSA;

    @JsonProperty("resultadoALNS")
    private ResultadoAlgoritmo resultadoALNS;

    @JsonProperty("aeropuertos")
    private List<AeropuertoDTO> aeropuertos;

    @JsonProperty("vuelosMaestros")
    private List<TramoDTO> vuelosMaestros;

    @JsonProperty("totalVuelos")
    private int totalVuelos;

    @JsonProperty("totalEnviosCargados")
    private int totalEnviosCargados;

    @JsonProperty("fechaInicio")
    private String fechaInicio;

    @JsonProperty("fechaFin")
    private String fechaFin;

    // ── Constructors ──────────────────────────────────────────────────────

    public RutaResponseDTO() {}

    // ── Getters / Setters ─────────────────────────────────────────────────

    public int getEscenario() { return escenario; }
    public void setEscenario(int escenario) { this.escenario = escenario; }

    public ResultadoAlgoritmo getResultadoSA() { return resultadoSA; }
    public void setResultadoSA(ResultadoAlgoritmo resultadoSA) { this.resultadoSA = resultadoSA; }

    public ResultadoAlgoritmo getResultadoALNS() { return resultadoALNS; }
    public void setResultadoALNS(ResultadoAlgoritmo resultadoALNS) { this.resultadoALNS = resultadoALNS; }

    public List<AeropuertoDTO> getAeropuertos() { return aeropuertos; }
    public void setAeropuertos(List<AeropuertoDTO> aeropuertos) { this.aeropuertos = aeropuertos; }

    public List<TramoDTO> getVuelosMaestros() { return vuelosMaestros; }
    public void setVuelosMaestros(List<TramoDTO> vuelosMaestros) { this.vuelosMaestros = vuelosMaestros; }

    public int getTotalVuelos() { return totalVuelos; }
    public void setTotalVuelos(int totalVuelos) { this.totalVuelos = totalVuelos; }

    public int getTotalEnviosCargados() { return totalEnviosCargados; }
    public void setTotalEnviosCargados(int totalEnviosCargados) { this.totalEnviosCargados = totalEnviosCargados; }

    public String getFechaInicio() { return fechaInicio; }
    public void setFechaInicio(String fechaInicio) { this.fechaInicio = fechaInicio; }

    public String getFechaFin() { return fechaFin; }
    public void setFechaFin(String fechaFin) { this.fechaFin = fechaFin; }

    // ── DTOs internos ─────────────────────────────────────────────────────

    public static class ResultadoAlgoritmo {
        @JsonProperty("algoritmo")
        private String algoritmo;

        @JsonProperty("costoInicial")
        private double costoInicial;

        @JsonProperty("costoFinal")
        private double costoFinal;

        @JsonProperty("mejoraRelativa")
        private double mejoraRelativa;

        @JsonProperty("iteraciones")
        private int iteraciones;

        @JsonProperty("tiempoEjecucionMs")
        private long tiempoEjecucionMs;

        @JsonProperty("enviosAsignados")
        private int enviosAsignados;

        @JsonProperty("enviosNoAceptados")
        private int enviosNoAceptados;

        @JsonProperty("totalEnvios")
        private int totalEnvios;

        @JsonProperty("rutasMuestra")
        private List<RutaMuestra> rutasMuestra;

        @JsonProperty("mensajeColapso")
        private String mensajeColapso;

        @JsonProperty("vuelosCanceladosIds")
        private List<Integer> vuelosCanceladosIds;

        // Constructors
        public ResultadoAlgoritmo() {}

        // Getters / Setters
        public String getAlgoritmo() { return algoritmo; }
        public void setAlgoritmo(String algoritmo) { this.algoritmo = algoritmo; }

        public double getCostoInicial() { return costoInicial; }
        public void setCostoInicial(double costoInicial) { this.costoInicial = costoInicial; }

        public double getCostoFinal() { return costoFinal; }
        public void setCostoFinal(double costoFinal) { this.costoFinal = costoFinal; }

        public double getMejoraRelativa() { return mejoraRelativa; }
        public void setMejoraRelativa(double mejoraRelativa) { this.mejoraRelativa = mejoraRelativa; }

        public int getIteraciones() { return iteraciones; }
        public void setIteraciones(int iteraciones) { this.iteraciones = iteraciones; }

        public long getTiempoEjecucionMs() { return tiempoEjecucionMs; }
        public void setTiempoEjecucionMs(long tiempoEjecucionMs) { this.tiempoEjecucionMs = tiempoEjecucionMs; }

        public int getEnviosAsignados() { return enviosAsignados; }
        public void setEnviosAsignados(int enviosAsignados) { this.enviosAsignados = enviosAsignados; }

        public int getEnviosNoAceptados() { return enviosNoAceptados; }
        public void setEnviosNoAceptados(int enviosNoAceptados) { this.enviosNoAceptados = enviosNoAceptados; }

        public int getTotalEnvios() { return totalEnvios; }
        public void setTotalEnvios(int totalEnvios) { this.totalEnvios = totalEnvios; }

        public List<RutaMuestra> getRutasMuestra() { return rutasMuestra; }
        public void setRutasMuestra(List<RutaMuestra> rutasMuestra) { this.rutasMuestra = rutasMuestra; }

        public String getMensajeColapso() { return mensajeColapso; }
        public void setMensajeColapso(String mensajeColapso) { this.mensajeColapso = mensajeColapso; }

        public List<Integer> getVuelosCanceladosIds() { return vuelosCanceladosIds; }
        public void setVuelosCanceladosIds(List<Integer> vuelosCanceladosIds) { this.vuelosCanceladosIds = vuelosCanceladosIds; }
    }

    public static class RutaMuestra {
        @JsonProperty("envioId")
        private String envioId;

        @JsonProperty("origen")
        private String origen;

        @JsonProperty("destino")
        private String destino;

        @JsonProperty("maletas")
        private int maletas;

        @JsonProperty("slaHoras")
        private int slaHoras;

        @JsonProperty("recepcionMinutosGMT")
        private int recepcionMinutosGMT;

        @JsonProperty("recepcionDiaOffset")
        private int recepcionDiaOffset;

        @JsonProperty("tramos")
        private List<TramoDTO> tramos;

        public RutaMuestra() {}

        public String getEnvioId() { return envioId; }
        public void setEnvioId(String envioId) { this.envioId = envioId; }

        public String getOrigen() { return origen; }
        public void setOrigen(String origen) { this.origen = origen; }

        public String getDestino() { return destino; }
        public void setDestino(String destino) { this.destino = destino; }

        public int getMaletas() { return maletas; }
        public void setMaletas(int maletas) { this.maletas = maletas; }

        public int getSlaHoras() { return slaHoras; }
        public void setSlaHoras(int slaHoras) { this.slaHoras = slaHoras; }

        public int getRecepcionMinutosGMT() { return recepcionMinutosGMT; }
        public void setRecepcionMinutosGMT(int recepcionMinutosGMT) { this.recepcionMinutosGMT = recepcionMinutosGMT; }

        public int getRecepcionDiaOffset() { return recepcionDiaOffset; }
        public void setRecepcionDiaOffset(int recepcionDiaOffset) { this.recepcionDiaOffset = recepcionDiaOffset; }

        public List<TramoDTO> getTramos() { return tramos; }
        public void setTramos(List<TramoDTO> tramos) { this.tramos = tramos; }
    }

    public static class TramoDTO {
        @JsonProperty("origen")
        private String origen;

        @JsonProperty("destino")
        private String destino;

        @JsonProperty("origenLat")
        private double origenLat;

        @JsonProperty("origenLon")
        private double origenLon;

        @JsonProperty("destinoLat")
        private double destinoLat;

        @JsonProperty("destinoLon")
        private double destinoLon;

        @JsonProperty("capacidad")
        private int capacidad;

        @JsonProperty("vueloId")
        private int vueloId;

        @JsonProperty("horaSalidaLocal")
        private String horaSalidaLocal;

        @JsonProperty("horaLlegadaLocal")
        private String horaLlegadaLocal;

        @JsonProperty("salidaMinutosGMT")
        private int salidaMinutosGMT;

        @JsonProperty("llegadaMinutosGMT")
        private int llegadaMinutosGMT;

        /** Días desde la fecha de inicio del rango. Permite ubicar el vuelo en el timeline global. */
        @JsonProperty("diaOffset")
        private int diaOffset;

        public TramoDTO() {}

        public String getOrigen() { return origen; }
        public void setOrigen(String origen) { this.origen = origen; }

        public String getDestino() { return destino; }
        public void setDestino(String destino) { this.destino = destino; }

        public double getOrigenLat() { return origenLat; }
        public void setOrigenLat(double origenLat) { this.origenLat = origenLat; }

        public double getOrigenLon() { return origenLon; }
        public void setOrigenLon(double origenLon) { this.origenLon = origenLon; }

        public double getDestinoLat() { return destinoLat; }
        public void setDestinoLat(double destinoLat) { this.destinoLat = destinoLat; }

        public double getDestinoLon() { return destinoLon; }
        public void setDestinoLon(double destinoLon) { this.destinoLon = destinoLon; }

        public int getCapacidad() { return capacidad; }
        public void setCapacidad(int capacidad) { this.capacidad = capacidad; }

        public int getVueloId() { return vueloId; }
        public void setVueloId(int vueloId) { this.vueloId = vueloId; }

        public String getHoraSalidaLocal() { return horaSalidaLocal; }
        public void setHoraSalidaLocal(String horaSalidaLocal) { this.horaSalidaLocal = horaSalidaLocal; }

        public String getHoraLlegadaLocal() { return horaLlegadaLocal; }
        public void setHoraLlegadaLocal(String horaLlegadaLocal) { this.horaLlegadaLocal = horaLlegadaLocal; }

        public int getSalidaMinutosGMT() { return salidaMinutosGMT; }
        public void setSalidaMinutosGMT(int salidaMinutosGMT) { this.salidaMinutosGMT = salidaMinutosGMT; }

        public int getLlegadaMinutosGMT() { return llegadaMinutosGMT; }
        public void setLlegadaMinutosGMT(int llegadaMinutosGMT) { this.llegadaMinutosGMT = llegadaMinutosGMT; }

        public int getDiaOffset() { return diaOffset; }
        public void setDiaOffset(int diaOffset) { this.diaOffset = diaOffset; }
    }

    public static class AeropuertoDTO {
        @JsonProperty("codigo")
        private String codigo;

        @JsonProperty("ciudad")
        private String ciudad;

        @JsonProperty("pais")
        private String pais;

        @JsonProperty("continente")
        private String continente;

        @JsonProperty("latitud")
        private double latitud;

        @JsonProperty("longitud")
        private double longitud;

        @JsonProperty("capacidadMax")
        private int capacidadMax;

        @JsonProperty("gmt")
        private int gmt;

        public AeropuertoDTO() {}

        public String getCodigo() { return codigo; }
        public void setCodigo(String codigo) { this.codigo = codigo; }

        public String getCiudad() { return ciudad; }
        public void setCiudad(String ciudad) { this.ciudad = ciudad; }

        public String getPais() { return pais; }
        public void setPais(String pais) { this.pais = pais; }

        public String getContinente() { return continente; }
        public void setContinente(String continente) { this.continente = continente; }

        public double getLatitud() { return latitud; }
        public void setLatitud(double latitud) { this.latitud = latitud; }

        public double getLongitud() { return longitud; }
        public void setLongitud(double longitud) { this.longitud = longitud; }

        public int getCapacidadMax() { return capacidadMax; }
        public void setCapacidadMax(int capacidadMax) { this.capacidadMax = capacidadMax; }

        public int getGmt() { return gmt; }
        public void setGmt(int gmt) { this.gmt = gmt; }
    }
}
