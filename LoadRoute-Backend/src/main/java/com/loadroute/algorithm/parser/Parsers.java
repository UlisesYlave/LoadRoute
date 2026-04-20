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
 * Adaptado para recibir InputStream (upload desde web) en vez de rutas de archivo.
 */
public class Parsers {

    private static final Logger LOG = Logger.getLogger(Parsers.class.getName());

    // ════════════════════════════════════════════════════════════════════════
    // 1. AEROPUERTO PARSER
    // ════════════════════════════════════════════════════════════════════════

    public static Map<String, Aeropuerto> parsearAeropuertos(InputStream inputStream) throws IOException {
        Map<String, Aeropuerto> mapa = new LinkedHashMap<>();
        String continenteActual = "";

        // El archivo viene en UTF-16 BE
        List<String> lineas = leerLineas(inputStream, Charset.forName("UTF-16"));

        for (String linea : lineas) {
            linea = linea.trim();
            if (linea.isEmpty() || linea.startsWith("*") || linea.startsWith("PDDS")) continue;

            // Detectar sección de continente
            if (linea.startsWith("America") || linea.contains("America del Sur")) {
                continenteActual = "america_sur"; continue;
            }
            if (linea.startsWith("Europa")) {
                continenteActual = "europa"; continue;
            }
            if (linea.startsWith("Asia")) {
                continenteActual = "asia"; continue;
            }

            String[] partes = linea.split("\\s+");
            if (partes.length < 7) continue;
            try {
                String codigo = partes[1];

                // Buscar GMT y capacidad
                int gmt = 0;
                int capacidad = 0;
                int gmtIdx = -1;
                for (int i = 2; i < partes.length; i++) {
                    try {
                        int val = Integer.parseInt(partes[i]);
                        // FIX: Precedencia de operadores corregida con paréntesis
                        if (gmtIdx == -1 && (partes[i].startsWith("+") || partes[i].startsWith("-"))) {
                            gmt = val;
                            gmtIdx = i;
                        } else if (gmtIdx > 0 && i == gmtIdx + 1) {
                            capacidad = val;
                        }
                    } catch (NumberFormatException ignored) {}
                }

                double lat = parsearCoordenada(linea, "Latitude:");
                double lon = parsearCoordenada(linea, "Longitude:");

                String ciudad = partes[2];
                String pais   = (partes.length > 3) ? partes[3] : "";

                Aeropuerto a = new Aeropuerto(codigo, ciudad, pais, continenteActual,
                        gmt, capacidad, lat, lon);
                mapa.put(codigo, a);
            } catch (Exception e) {
                // Línea no parseable, ignorar
            }
        }

        LOG.info("Aeropuertos cargados: " + mapa.size());
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

        for (String linea : lineas) {
            linea = linea.trim();
            if (linea.isEmpty()) continue;

            String[] partes = linea.split("-");
            if (partes.length < 5) continue;

            try {
                String codOrigen  = partes[0].trim();
                String codDestino = partes[1].trim();
                LocalTime salida  = LocalTime.parse(partes[2].trim(), fmt);
                LocalTime llegada = LocalTime.parse(partes[3].trim(), fmt);
                int capacidad     = Integer.parseInt(partes[4].trim());

                Aeropuerto origen  = aeropuertos.get(codOrigen);
                Aeropuerto destino = aeropuertos.get(codDestino);

                if (origen == null || destino == null) {
                    LOG.warning("Vuelo con aeropuerto desconocido: " + linea);
                    continue;
                }

                vuelos.add(new Vuelo(origen, destino, salida, llegada, capacidad));
            } catch (Exception e) {
                LOG.warning("Línea de vuelo no parseable: " + linea + " → " + e.getMessage());
            }
        }

        LOG.info("Vuelos cargados: " + vuelos.size());
        return vuelos;
    }

    // ════════════════════════════════════════════════════════════════════════
    // 3. ENVÍOS PARSER
    // ════════════════════════════════════════════════════════════════════════

    public static Map<String, Envio> parsearEnvios(InputStream inputStream,
                                                   String nombreArchivo,
                                                   Map<String, Aeropuerto> aeropuertos,
                                                   int limite) throws IOException {
        Map<String, Envio> mapa = new LinkedHashMap<>();

        String codigoOrigen = extraerIATADeNombreArchivo(nombreArchivo);

        Aeropuerto origen = aeropuertos.get(codigoOrigen);
        if (origen == null) {
            throw new IllegalArgumentException(
                    "Aeropuerto origen '" + codigoOrigen + "' no encontrado en el catálogo.");
        }

        List<String> lineas = leerLineas(inputStream, StandardCharsets.UTF_8);
        int cargados = 0;

        for (String linea : lineas) {
            linea = linea.trim();
            if (linea.isEmpty()) continue;
            if (limite > 0 && cargados >= limite) break;

            String[] partes = linea.split("-");
            if (partes.length < 7) continue;

            try {
                String id          = partes[0].trim();
                String fecha       = partes[1].trim();
                String hora        = partes[2].trim();
                String minuto      = partes[3].trim();
                String codDestino  = partes[4].trim();
                int    maletas     = Integer.parseInt(partes[5].trim());
                String idCliente   = partes[6].trim();

                Aeropuerto destino = aeropuertos.get(codDestino);
                if (destino == null) {
                    continue; // Destino no en nuestra red
                }

                LocalDateTime recepcion = LocalDateTime.parse(
                        fecha + "T" + hora + ":" + minuto,
                        DateTimeFormatter.ofPattern("yyyyMMdd'T'HH:mm"));

                Envio envio = new Envio(id, idCliente, origen, destino, recepcion, maletas);
                mapa.put(id, envio);
                cargados++;
            } catch (Exception e) {
                // Línea no parseable, ignorar
            }
        }

        LOG.info("Envíos cargados desde " + codigoOrigen + ": " + mapa.size());
        return mapa;
    }

    // ── Utilidades internas ───────────────────────────────────────────────────

    static String extraerIATADeNombreArchivo(String nombre) {
        Pattern patron = Pattern.compile("_envios_([A-Z]{4})_", Pattern.CASE_INSENSITIVE);
        Matcher m = patron.matcher(nombre);
        if (m.find()) return m.group(1).toUpperCase();
        // Fallback: si no tiene ese formato, extraer últimas 4 letras mayúsculas
        Pattern fallback = Pattern.compile("([A-Z]{4})", Pattern.CASE_INSENSITIVE);
        Matcher mf = fallback.matcher(nombre);
        if (mf.find()) return mf.group(1).toUpperCase();
        throw new IllegalArgumentException("No se puede extraer IATA de: " + nombre);
    }

    static double parsearCoordenada(String linea, String prefijo) {
        int idx = linea.indexOf(prefijo);
        if (idx < 0) return 0.0;
        String sub = linea.substring(idx + prefijo.length()).trim();
        Pattern p = Pattern.compile("(\\d+)[°]\\s*(\\d+)[']\\s*([\\d.]+)[\"']?\\s*([NSEW])");
        Matcher m = p.matcher(sub);
        if (m.find()) {
            double grados  = Double.parseDouble(m.group(1));
            double minutos = Double.parseDouble(m.group(2));
            double segundos = Double.parseDouble(m.group(3));
            String dir     = m.group(4);
            double decimal = grados + minutos / 60.0 + segundos / 3600.0;
            if (dir.equals("S") || dir.equals("W")) decimal = -decimal;
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
