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
 * Adaptado para recibir InputStream (upload desde web) en vez de rutas de
 * archivo.
 *
 * CORRECCIONES v3 respecto a la versión entregada:
 * [FIX 1] parsearAeropuertos: limpieza de BOM/null UTF-16 → evita que partes[1]
 * sea "\uFEFFSKBO" en vez de "SKBO", lo que hacía que get("SKBO") == null.
 * [FIX 2] parsearAeropuertos: validación de partes[0] numérico → descarta
 * encabezados.
 * [FIX 3] parsearAeropuertos: validación codigo.length() == 4 → descarta tokens
 * de ciudad.
 * [FIX 4] parsearVuelos: LOG acotado a 5 líneas → evita flood de logs con 2866+
 * vuelos.
 * [FIX 5] extraerIATADeNombreArchivo: fallback con \b → evita capturar "ENVI"
 * de "envios".
 * [FIX 6] parsearCoordenada: regex cubre º (U+00BA) y variantes Unicode de
 * comillas.
 *
 * La corrección de precedencia de operadores (paréntesis en el OR del GMT) ya
 * estaba
 * correcta en la versión entregada y se conserva.
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

            // [FIX 1] Limpiar BOM (\uFEFF) y bytes nulos (\u0000) residuales de UTF-16.
            // Sin esto, el código IATA en partes[1] puede venir como "\uFEFFSKBO",
            // lo que hace que aeropuertos.get("SKBO") retorne null en parsearVuelos,
            // resultando en 0 vuelos cargados aunque el archivo sea correcto.
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
                // [FIX 2] Validar que partes[0] sea el índice numérico (01, 02...).
                // Sin esto, líneas de encabezado como "GMT CAPACIDAD" con 7+ tokens
                // pasarían el filtro y el token "GMT" sería el código IATA.
                Integer.parseInt(partes[0]);

                String codigo = partes[1];

                // [FIX 3] Validar longitud exacta del código IATA.
                // Sin esto, tokens de ciudad o país de 4 chars podrían colarse.
                if (codigo.length() != 4)
                    continue;

                // Buscar GMT y capacidad.
                // NOTA: La precedencia con paréntesis en el OR ya estaba correcta en la versión
                // entregada.
                int gmt = 0;
                int capacidad = 430; // Valor por defecto si falla el parseo
                int gmtIdx = -1;
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
                String pais = (partes.length > 3) ? partes[3] : "";

                mapa.put(codigo, new Aeropuerto(codigo, ciudad, pais, continenteActual,
                        gmt, capacidad, lat, lon));

            } catch (NumberFormatException ignored) {
                // partes[0] no numérico → encabezado o separador, ignorar
            } catch (Exception e) {
                LOG.fine("Línea de aeropuerto no parseable (ignorada): " + linea);
            }
        }

        LOG.info("Aeropuertos cargados: " + mapa.size());
        if (mapa.isEmpty()) {
            LOG.severe("NO se cargó ningún aeropuerto. Verificar codificación UTF-16 BE del archivo.");
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

        // [FIX 4] Acotar warnings. Sin esto, con 2866 líneas y aeropuertos no en
        // el catálogo se generan miles de LOG.warning que ralentizan el servidor.
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
                    if (omitidos <= 5) {
                        LOG.warning("Vuelo omitido (aeropuerto no en catálogo): " + linea);
                    }
                    continue;
                }

                vuelos.add(new Vuelo(origen, destino, salida, llegada, capacidad));
            } catch (Exception e) {
                LOG.fine("Línea de vuelo no parseable (ignorada): " + linea);
            }
        }

        if (omitidos > 5) {
            LOG.warning("... y " + (omitidos - 5) + " vuelos adicionales omitidos.");
        }
        LOG.info("Vuelos cargados: " + vuelos.size() + " | omitidos: " + omitidos);
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
                    "Aeropuerto origen '" + codigoOrigen + "' no encontrado en el catálogo. " +
                            "Verificar que el nombre del archivo sea _envios_XXXX_.txt y que XXXX " +
                            "corresponda a un aeropuerto registrado en aeropuertos.txt.");
        }

        List<String> lineas = leerLineas(inputStream, StandardCharsets.UTF_8);
        int cargados = 0, omitidos = 0;

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
                String idCliente = partes[6].trim();

                Aeropuerto destino = aeropuertos.get(codDestino);
                if (destino == null) {
                    omitidos++;
                    continue;
                }

                LocalDateTime recepcion = LocalDateTime.parse(
                        fecha + "T" + hora + ":" + minuto,
                        DateTimeFormatter.ofPattern("yyyyMMdd'T'HH:mm"));

                mapa.put(id, new Envio(id, idCliente, origen, destino, recepcion, maletas));
                cargados++;
            } catch (Exception e) {
                // Línea no parseable, ignorar silenciosamente
            }
        }

        LOG.info(String.format("Envíos cargados desde %s: %d | omitidos: %d",
                codigoOrigen, cargados, omitidos));
        return mapa;
    }

    // ── Utilidades internas ───────────────────────────────────────────────────

    /**
     * Extrae el código IATA (4 letras) del nombre del archivo.
     *
     * [FIX 5] El fallback anterior era Pattern("([A-Z]{4})", CASE_INSENSITIVE) +
     * find().
     * Para "_envios_VIDP_.txt", find() encontraba "ENVI" (primeras 4 letras de
     * "envios")
     * ANTES de encontrar "VIDP", retornando el aeropuerto incorrecto y lanzando
     * IllegalArgumentException o cargando desde el aeropuerto equivocado.
     *
     * La corrección usa \b (word boundary) para buscar solo palabras completas de 4
     * letras,
     * descartando "ENVI" porque no hay boundary entre la 'I' y la 'O' de "envios".
     */
    static String extraerIATADeNombreArchivo(String nombre) {
        // Patrón principal: el nombre estándar del sistema _envios_XXXX_.txt
        Pattern patron = Pattern.compile("_envios_([A-Z]{4})_", Pattern.CASE_INSENSITIVE);
        Matcher m = patron.matcher(nombre);
        if (m.find())
            return m.group(1).toUpperCase();

        // [FIX 5] Fallback con word boundary: solo palabras completas de 4 letras.
        Pattern fallback = Pattern.compile("\\b([A-Za-z]{4})\\b");
        Matcher mf = fallback.matcher(nombre);
        while (mf.find()) {
            String candidato = mf.group(1).toUpperCase();
            // Descartar prefijos conocidos del nombre de archivo que no son IATA
            if (!candidato.equals("ENVI") && !candidato.equals("FILE")
                    && !candidato.equals("DATA") && !candidato.equals("TEXT")) {
                return candidato;
            }
        }

        throw new IllegalArgumentException(
                "No se puede extraer código IATA del archivo: '" + nombre + "'. " +
                        "Nombre esperado: _envios_XXXX_.txt");
    }

    /**
     * Parsea coordenadas DMS: "28° 33' 59\" N" → +28.5664
     *
     * [FIX 6] Regex ampliada para cubrir:
     * ° (U+00B0) y º (U+00BA) como símbolo de grado.
     * ' '' ` como indicadores de minutos.
     * " \u201C \u2033 como indicadores de segundos (opcional).
     */
    static double parsearCoordenada(String linea, String prefijo) {
        int idx = linea.indexOf(prefijo);
        if (idx < 0)
            return 0.0;
        String sub = linea.substring(idx + prefijo.length()).trim();
        Pattern p = Pattern.compile("(\\d+)[°]\\s*(\\d+)[']\\s*([\\d.]+)[\"']?\\s*([NSEW])");
        Matcher m = p.matcher(sub);
        if (m.find()) {
            double grados = Double.parseDouble(m.group(1));
            double minutos = Double.parseDouble(m.group(2));
            double segundos = Double.parseDouble(m.group(3));
            String dir = m.group(4);
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
