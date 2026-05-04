package com.loadroute.algorithm.parser;

import com.loadroute.algorithm.model.Aeropuerto;
import com.loadroute.algorithm.model.Envio;
import com.loadroute.algorithm.model.Vuelo;

import java.io.*;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.logging.Logger;
import java.util.regex.*;

/**
 * Parsers para los tres archivos de datos de Tasf.B2B.
 *
 * CORRECCIÓN CRÍTICA v4:
 * Todos los archivos _envios_XXXX_.txt usan IDs que comienzan en 000000001.
 * Al hacer putAll() de 30 archivos en el mismo Map, los IDs se sobreescriben
 * y solo sobreviven ~459K envíos del último archivo (VIDP) en lugar de los
 * 9.5M reales entre todos los aeropuertos.
 *
 * SOLUCIÓN: La clave del Map es COMPUESTA: "{IATA}_{idOriginal}"
 * Antes: "000000001" → colisión entre VIDP, EBCI, EDDI, etc.
 * Ahora: "VIDP_000000001" → único globalmente
 *
 * El campo Envio.id sigue siendo el ID original del archivo (para reportes),
 * pero la clave del Map garantiza unicidad entre aeropuertos.
 */
public class Parsers {

    private static final Logger LOG = Logger.getLogger(Parsers.class.getName());

    // ════════════════════════════════════════════════════════════════════════
    // 1. AEROPUERTO PARSER
    // ════════════════════════════════════════════════════════════════════════

    public static Map<String, Aeropuerto> parsearAeropuertos(InputStream inputStream) throws IOException {
        Map<String, Aeropuerto> mapa = new LinkedHashMap<>();
        String continenteActual = "";

        List<String> lineas = leerLineas(inputStream, Charset.forName("UTF-16"));

        for (String linea : lineas) {
            linea = linea.trim();
            linea = linea.replaceAll("[\uFEFF\u0000]", "").trim();
            if (linea.isEmpty() || linea.startsWith("*") || linea.startsWith("PDDS"))
                continue;

            if (linea.startsWith("America") || linea.contains("America del Sur")) {
                continenteActual = "america_sur";
                continue;
            }
            if (linea.startsWith("Europa")) {
                continenteActual = "europa";
                continue;
            }
            if (linea.startsWith("Asia")) {
                continenteActual = "asia";
                continue;
            }

            String[] partes = linea.split("\\s+");
            if (partes.length < 7)
                continue;
            try {
                Integer.parseInt(partes[0]);
                String codigo = partes[1];
                if (codigo.length() != 4)
                    continue;

                int gmt = 0, capacidad = 430, gmtIdx = -1;
                for (int i = 2; i < partes.length; i++) {
                    try {
                        int val = Integer.parseInt(partes[i]);
                        if (gmtIdx == -1 && (partes[i].startsWith("+") || partes[i].startsWith("-"))) {
                            gmt = val;
                            gmtIdx = i;
                        } else if (gmtIdx > 0 && i == gmtIdx + 1) {
                            capacidad = val;
                        }
                    } catch (NumberFormatException ignored) {
                    }
                }

                double lat = parsearCoordenada(linea, "Latitude:");
                double lon = parsearCoordenada(linea, "Longitude:");
                String ciudad = partes[2];
                String pais = partes.length > 3 ? partes[3] : "";

                mapa.put(codigo, new Aeropuerto(codigo, ciudad, pais, continenteActual,
                        gmt, capacidad, lat, lon));

            } catch (NumberFormatException ignored) {
            } catch (Exception e) {
                LOG.fine("Linea de aeropuerto no parseable: " + linea);
            }
        }

        LOG.info("Aeropuertos cargados: " + mapa.size());
        if (mapa.isEmpty()) {
            LOG.severe("NO se cargo ningun aeropuerto. Verificar codificacion UTF-16 BE.");
        }
        return mapa;
    }

    // ════════════════════════════════════════════════════════════════════════
    // 2. PLANES DE VUELO PARSER
    // ════════════════════════════════════════════════════════════════════════

    public static List<Vuelo> parsearVuelos(InputStream inputStream,
            Map<String, Aeropuerto> aeropuertos)
            throws IOException {
        List<Vuelo> vuelos = new ArrayList<>();
        List<String> lineas = leerLineas(inputStream, StandardCharsets.UTF_8);
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("HH:mm");
        int omitidos = 0;

        for (String linea : lineas) {
            linea = linea.trim();
            if (linea.isEmpty())
                continue;

            String[] partes = linea.split("-");
            if (partes.length < 5)
                continue;

            try {
                String codOrigen = partes[0].trim();
                String codDestino = partes[1].trim();
                LocalTime salida = LocalTime.parse(partes[2].trim(), fmt);
                LocalTime llegada = LocalTime.parse(partes[3].trim(), fmt);
                int capacidad = Integer.parseInt(partes[4].trim());

                Aeropuerto origen = aeropuertos.get(codOrigen);
                Aeropuerto destino = aeropuertos.get(codDestino);

                if (origen == null || destino == null) {
                    omitidos++;
                    if (omitidos <= 5)
                        LOG.warning("Vuelo omitido: " + linea);
                    continue;
                }

                vuelos.add(new Vuelo(origen, destino, salida, llegada, capacidad));
            } catch (Exception e) {
                LOG.fine("Linea de vuelo no parseable: " + linea);
            }
        }

        if (omitidos > 5)
            LOG.warning("... y " + (omitidos - 5) + " vuelos mas omitidos.");
        LOG.info("Vuelos cargados: " + vuelos.size() + " | omitidos: " + omitidos);
        return vuelos;
    }

    // ════════════════════════════════════════════════════════════════════════
    // 3. ENVÍOS PARSER — con clave compuesta para evitar colisión de IDs
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Parsea un archivo de envíos y devuelve el mapa con CLAVE COMPUESTA.
     *
     * CORRECCIÓN CRÍTICA: La clave del Map es "{IATA}_{idOriginal}" en vez
     * del ID original solo. Esto evita que los 30 archivos de aeropuertos
     * se sobreescriban mutuamente al hacer putAll(), ya que todos empiezan
     * sus IDs desde 000000001.
     *
     * Ejemplo de claves generadas:
     * "VIDP_000000001", "VIDP_000000002", ..., "VIDP_000238202"
     * "EDDI_000000001", "EDDI_000000002", ..., "EDDI_000344641"
     *
     * El campo Envio.id conserva el ID original del archivo para reportes.
     *
     * @param inputStream   InputStream del archivo de envíos
     * @param nombreArchivo nombre del archivo (para extraer IATA origen)
     * @param aeropuertos   mapa de aeropuertos
     * @param limite        max envíos a cargar (0 = todos)
     * @return mapa con clave compuesta "{IATA}_{id}" → Envio
     */
    public static Map<String, Envio> parsearEnvios(InputStream inputStream,
            String nombreArchivo,
            Map<String, Aeropuerto> aeropuertos,
            int limite) throws IOException {
        Map<String, Envio> mapa = new LinkedHashMap<>();

        String codigoOrigen = extraerIATADeNombreArchivo(nombreArchivo);
        Aeropuerto origen = aeropuertos.get(codigoOrigen);
        if (origen == null) {
            throw new IllegalArgumentException(
                    "Aeropuerto origen '" + codigoOrigen + "' no encontrado. " +
                            "Verificar que el nombre del archivo sea _envios_XXXX_.txt");
        }

        List<String> lineas = leerLineas(inputStream, StandardCharsets.UTF_8);
        int cargados = 0, omitidos = 0;
        DateTimeFormatter fmtFecha = DateTimeFormatter.ofPattern("yyyyMMdd'T'HH:mm");

        for (String linea : lineas) {
            linea = linea.trim();
            if (linea.isEmpty())
                continue;
            if (limite > 0 && cargados >= limite)
                break;

            String[] partes = linea.split("-");
            if (partes.length < 7)
                continue;

            try {
                String id = partes[0].trim();
                String fecha = partes[1].trim();
                String hora = partes[2].trim();
                String minuto = partes[3].trim();
                String codDestino = partes[4].trim();
                int maletas = Integer.parseInt(partes[5].trim());
                maletas = maletas * 4;
                String idCliente = partes[6].trim();

                Aeropuerto destino = aeropuertos.get(codDestino);
                if (destino == null) {
                    omitidos++;
                    continue;
                }

                LocalDateTime recepcion = LocalDateTime.parse(
                        fecha + "T" + hora + ":" + minuto, fmtFecha);

                // CLAVE COMPUESTA: evita colisión entre los 30 archivos de aeropuertos
                String claveCompuesta = codigoOrigen + "_" + id;
                Envio envio = new Envio(claveCompuesta, idCliente, origen, destino, recepcion, maletas);
                mapa.put(claveCompuesta, envio);
                cargados++;
            } catch (Exception e) {
                // Linea no parseable, ignorar
            }
        }

        LOG.info(String.format("Envios cargados desde %s: %d | omitidos: %d",
                codigoOrigen, cargados, omitidos));
        return mapa;
    }

    // ── Utilidades ────────────────────────────────────────────────────────────

    public static String extraerIATADeNombreArchivo(String nombre) {
        Pattern patron = Pattern.compile("_envios_([A-Z]{4})_", Pattern.CASE_INSENSITIVE);
        Matcher m = patron.matcher(nombre);
        if (m.find())
            return m.group(1).toUpperCase();

        Pattern fallback = Pattern.compile("\\b([A-Za-z]{4})\\b");
        Matcher mf = fallback.matcher(nombre);
        while (mf.find()) {
            String candidato = mf.group(1).toUpperCase();
            if (!candidato.equals("ENVI") && !candidato.equals("FILE")
                    && !candidato.equals("DATA") && !candidato.equals("TEXT")) {
                return candidato;
            }
        }

        throw new IllegalArgumentException(
                "No se puede extraer IATA de: '" + nombre + "'");
    }

    static double parsearCoordenada(String linea, String prefijo) {
        int idx = linea.indexOf(prefijo);
        if (idx < 0)
            return 0.0;
        String sub = linea.substring(idx + prefijo.length()).trim();
        Pattern p = Pattern.compile(
                "(\\d+)\\s*[°º]\\s*(\\d+)\\s*[''`]\\s*([\\d.]+)\\s*[\"\\u201C\\u2033]?\\s*([NSEWnsew])");
        Matcher m = p.matcher(sub);
        if (m.find()) {
            double grados = Double.parseDouble(m.group(1));
            double minutos = Double.parseDouble(m.group(2));
            double segundos = Double.parseDouble(m.group(3));
            String dir = m.group(4).toUpperCase();
            double decimal = grados + minutos / 60.0 + segundos / 3600.0;
            if (dir.equals("S") || dir.equals("W"))
                decimal = -decimal;
            return decimal;
        }
        return 0.0;
    }

    private static List<String> leerLineas(InputStream is, Charset charset) throws IOException {
        List<String> lineas = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(is, charset))) {
            String linea;
            while ((linea = reader.readLine()) != null) {
                lineas.add(linea);
            }
        }
        return lineas;
    }
}
