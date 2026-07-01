package com.loadroute.service;

import com.loadroute.algorithm.model.Aeropuerto;
import com.loadroute.algorithm.model.Envio;
import com.loadroute.algorithm.model.Vuelo;
import com.loadroute.algorithm.parser.Parsers;
import com.loadroute.entity.AeropuertoEntity;
import com.loadroute.entity.EnvioEntity;
import com.loadroute.entity.VueloEntity;
import com.loadroute.entity.EnvioDiaADiaEntity;
import com.loadroute.repository.AeropuertoRepository;
import com.loadroute.repository.EnvioRepository;
import com.loadroute.repository.VueloRepository;
import com.loadroute.repository.EnvioDiaADiaRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Timestamp;

import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDateTime;
import java.util.*;
import java.util.logging.Logger;
import java.util.stream.Collectors;

@Service
public class CargaDatosService {

    private static final Logger LOG = Logger.getLogger(CargaDatosService.class.getName());

    @PersistenceContext
    private EntityManager entityManager;

    private final AeropuertoRepository aeropuertoRepository;
    private final VueloRepository vueloRepository;
    private final EnvioRepository envioRepository;
    private final EnvioDiaADiaRepository envioDiaADiaRepository;
    private final JdbcTemplate jdbcTemplate;

    public CargaDatosService(AeropuertoRepository aeropuertoRepository,
                              VueloRepository vueloRepository,
                              EnvioRepository envioRepository,
                              EnvioDiaADiaRepository envioDiaADiaRepository,
                              JdbcTemplate jdbcTemplate) {
        this.aeropuertoRepository = aeropuertoRepository;
        this.vueloRepository = vueloRepository;
        this.envioRepository = envioRepository;
        this.envioDiaADiaRepository = envioDiaADiaRepository;
        this.jdbcTemplate = jdbcTemplate;
    }

    // ── Métodos para guardar/reemplazar datos en BD ──────────────────────────

    @Transactional
    public void guardarOReemplazarAeropuertos(InputStream aeropuertosIS) throws IOException {
        LOG.info("Iniciando reemplazo de aeropuertos en la base de datos...");
        
        // Al borrar aeropuertos se deben borrar vuelos y envíos por integridad referencial
        envioRepository.deleteAllInBatch();
        vueloRepository.deleteAllInBatch();
        aeropuertoRepository.deleteAllInBatch();

        Map<String, Aeropuerto> parsed = Parsers.parsearAeropuertos(aeropuertosIS);
        List<AeropuertoEntity> entities = parsed.values().stream()
                .map(a -> new AeropuertoEntity(
                        a.getCodigo(),
                        a.getCiudad(),
                        a.getPais(),
                        a.getContinente(),
                        a.getGmt(),
                        a.getCapacidadMax(),
                        a.getLatitud(),
                        a.getLongitud()
                ))
                .collect(Collectors.toList());

        aeropuertoRepository.saveAll(entities);
        LOG.info("Aeropuertos reemplazados exitosamente. Total cargados: " + entities.size());
    }

    @Transactional
    public void guardarOReemplazarVuelos(InputStream vuelosIS) throws IOException {
        LOG.info("Iniciando reemplazo de vuelos en la base de datos...");
        
        // Borramos los vuelos existentes
        vueloRepository.deleteAllInBatch();

        // Necesitamos el mapa de aeropuertos desde la BD para parsear
        Map<String, Aeropuerto> aeropuertosMap = obtenerAeropuertosDeBDComoModelos();

        List<Vuelo> parsedVuelos = Parsers.parsearVuelos(vuelosIS, aeropuertosMap);

        // Pre-cargar todos los AeropuertoEntity para evitar N+1 queries
        Map<String, AeropuertoEntity> dbAeropuertos = aeropuertoRepository.findAll().stream()
                .collect(Collectors.toMap(AeropuertoEntity::getCodigo, a -> a));

        List<VueloEntity> entities = new ArrayList<>();
        for (Vuelo v : parsedVuelos) {
            AeropuertoEntity origenEntity = dbAeropuertos.get(v.getOrigen().getCodigo());
            AeropuertoEntity destinoEntity = dbAeropuertos.get(v.getDestino().getCodigo());

            if (origenEntity == null) {
                throw new IllegalArgumentException("Aeropuerto origen " + v.getOrigen().getCodigo() + " no existe en BD");
            }
            if (destinoEntity == null) {
                throw new IllegalArgumentException("Aeropuerto destino " + v.getDestino().getCodigo() + " no existe en BD");
            }

            entities.add(new VueloEntity(
                    origenEntity,
                    destinoEntity,
                    v.getHoraSalidaLocal(),
                    v.getHoraLlegadaLocal(),
                    v.getCapacidadMax()
            ));
        }

        LOG.info("Guardando " + entities.size() + " vuelos en la base de datos...");
        vueloRepository.saveAll(entities);
        LOG.info("Vuelos reemplazados exitosamente.");
    }

    @Transactional
    public void guardarOReemplazarEnvios(List<MultipartFile> enviosFiles) throws IOException {
        LOG.info("Iniciando reemplazo de envíos en la base de datos usando JDBC Batch...");
        
        // Borramos los envíos existentes
        envioRepository.deleteAllInBatch();

        Map<String, Aeropuerto> aeropuertosMap = obtenerAeropuertosDeBDComoModelos();

        // Obtener mapa de código IATA a ID numérico para validación y mapeo de claves foráneas
        Map<String, Long> dbAeropuertosIds = aeropuertoRepository.findAll().stream()
                .collect(Collectors.toMap(AeropuertoEntity::getCodigo, AeropuertoEntity::getId));

        String sql = "INSERT INTO envios (clave_compuesta, cliente_id, origen_id, destino_id, fecha_creacion, cantidad_maletas) VALUES (?, ?, ?, ?, ?, ?)";
        
        List<Envio> batchList = new ArrayList<>();
        int totalProcesados = 0;
        int batchLimit = 50000; // Procesamos 50,000 en memoria antes de mandarlos en micro-lotes de JDBC

        for (MultipartFile file : enviosFiles) {
            String filename = file.getOriginalFilename();
            if (filename == null || filename.isEmpty()) continue;

            Map<String, Envio> parsedEnvios = Parsers.parsearEnvios(file.getInputStream(), filename, aeropuertosMap, 0);
            LOG.info("Archivo " + filename + ": parseados " + parsedEnvios.size() + " envíos.");
            
            for (Envio e : parsedEnvios.values()) {
                String origenCod = e.getOrigen().getCodigo();
                String destinoCod = e.getDestino().getCodigo();

                Long origenId = dbAeropuertosIds.get(origenCod);
                Long destinoId = dbAeropuertosIds.get(destinoCod);

                if (origenId == null) {
                    throw new IllegalArgumentException("Aeropuerto origen " + origenCod + " no existe en BD");
                }
                if (destinoId == null) {
                    throw new IllegalArgumentException("Aeropuerto destino " + destinoCod + " no existe en BD");
                }

                batchList.add(e);
                totalProcesados++;

                if (batchList.size() >= batchLimit) {
                    ejecutarBatchJDBC(sql, batchList, dbAeropuertosIds);
                    LOG.info(String.format("Progreso de guardado de envíos: %d guardados en base de datos...", totalProcesados));
                    batchList.clear();
                }
            }
        }

        // Guardar elementos restantes en el lote final
        if (!batchList.isEmpty()) {
            ejecutarBatchJDBC(sql, batchList, dbAeropuertosIds);
            LOG.info(String.format("Progreso de guardado de envíos: %d guardados en base de datos...", totalProcesados));
            batchList.clear();
        }
        
        LOG.info("Envíos reemplazados exitosamente. Total guardados: " + totalProcesados);
    }

    private void ejecutarBatchJDBC(String sql, List<Envio> envios, Map<String, Long> dbAeropuertosIds) {
        int subBatchSize = 1000; // Coincide con hibernate.jdbc.batch_size para evitar exceder el max_allowed_packet
        for (int i = 0; i < envios.size(); i += subBatchSize) {
            List<Envio> subList = envios.subList(i, Math.min(i + subBatchSize, envios.size()));
            jdbcTemplate.batchUpdate(sql, new org.springframework.jdbc.core.BatchPreparedStatementSetter() {
                @Override
                public void setValues(PreparedStatement ps, int idx) throws SQLException {
                    Envio e = subList.get(idx);
                    ps.setString(1, e.getId()); // claveCompuesta
                    ps.setString(2, e.getIdCliente());
                    ps.setLong(3, dbAeropuertosIds.get(e.getOrigen().getCodigo()));
                    ps.setLong(4, dbAeropuertosIds.get(e.getDestino().getCodigo()));
                    ps.setTimestamp(5, Timestamp.valueOf(e.getFechaHoraRecepcion()));
                    ps.setInt(6, e.getCantidadMaletas());
                }

                @Override
                public int getBatchSize() {
                    return subList.size();
                }
            });
        }
    }

    // ── Métodos de carga desde BD hacia Modelos del Algoritmo ─────────────────

    public Map<String, Aeropuerto> obtenerAeropuertosDeBDComoModelos() {
        List<AeropuertoEntity> entities = aeropuertoRepository.findAll();
        Map<String, Aeropuerto> mapa = new LinkedHashMap<>();
        for (AeropuertoEntity entity : entities) {
            mapa.put(entity.getCodigo(), new Aeropuerto(
                    entity.getCodigo(),
                    entity.getCiudad(),
                    entity.getPais(),
                    entity.getContinente(),
                    entity.getGmt(),
                    entity.getCapacidadMax(),
                    entity.getLatitud(),
                    entity.getLongitud()
            ));
        }
        return mapa;
    }

    public List<Vuelo> obtenerVuelosDeBDComoModelos(Map<String, Aeropuerto> aeropuertosMap) {
        List<VueloEntity> entities = vueloRepository.findAll();
        List<Vuelo> vuelos = new ArrayList<>();
        for (VueloEntity entity : entities) {
            Aeropuerto origen = aeropuertosMap.get(entity.getOrigen().getCodigo());
            Aeropuerto destino = aeropuertosMap.get(entity.getDestino().getCodigo());
            if (origen != null && destino != null) {
                Vuelo v = new Vuelo(
                        origen,
                        destino,
                        entity.getHoraSalidaLocal(),
                        entity.getHoraLlegadaLocal(),
                        entity.getCapacidadMax()
                );
                v.setId(entity.getId().intValue());
                vuelos.add(v);
            }
        }
        return vuelos;
    }

    public Map<String, Envio> obtenerEnviosDeBDComoModelos(Map<String, Aeropuerto> aeropuertosMap) {
        List<EnvioEntity> entities = envioRepository.findAll();
        Map<String, Envio> enviosMap = new LinkedHashMap<>();
        for (EnvioEntity entity : entities) {
            Aeropuerto origen = aeropuertosMap.get(entity.getOrigen().getCodigo());
            Aeropuerto destino = aeropuertosMap.get(entity.getDestino().getCodigo());
            if (origen != null && destino != null) {
                Envio envio = new Envio(
                        entity.getClaveCompuesta(),
                        entity.getClienteId(),
                        origen,
                        destino,
                        entity.getFechaCreacion(),
                        entity.getCantidadMaletas()
                );
                enviosMap.put(entity.getClaveCompuesta(), envio);
            }
        }
        return enviosMap;
    }

    public Map<String, Envio> obtenerEnviosDeBDComoModelosEnRango(Map<String, Aeropuerto> aeropuertosMap, LocalDateTime inicio, LocalDateTime fin) {
        List<EnvioEntity> entities = envioRepository.findByFechaCreacionBetween(inicio, fin);
        Map<String, Envio> enviosMap = new LinkedHashMap<>();
        for (EnvioEntity entity : entities) {
            Aeropuerto origen = aeropuertosMap.get(entity.getOrigen().getCodigo());
            Aeropuerto destino = aeropuertosMap.get(entity.getDestino().getCodigo());
            if (origen != null && destino != null) {
                Envio envio = new Envio(
                        entity.getClaveCompuesta(),
                        entity.getClienteId(),
                        origen,
                        destino,
                        entity.getFechaCreacion(),
                        entity.getCantidadMaletas()
                );
                enviosMap.put(entity.getClaveCompuesta(), envio);
            }
        }
        return enviosMap;
    }

    // ── Métodos para comprobar existencia de datos en BD ─────────────────────

    public boolean tieneAeropuertos() {
        return aeropuertoRepository.count() > 0;
    }

    public boolean tieneVuelos() {
        return vueloRepository.count() > 0;
    }

    public boolean tieneEnvios() {
        return envioRepository.count() > 0;
    }

    @Transactional
    public int cargarEnviosDiaADiaDesdeArchivo(MultipartFile file) throws IOException {
        String filename = file.getOriginalFilename();
        if (filename == null || filename.isEmpty()) return 0;

        Map<String, Aeropuerto> aeropuertosMap = obtenerAeropuertosDeBDComoModelos();
        Map<String, Long> dbAeropuertosIds = aeropuertoRepository.findAll().stream()
                .collect(Collectors.toMap(AeropuertoEntity::getCodigo, AeropuertoEntity::getId));

        Map<String, Envio> parsedEnvios = Parsers.parsearEnvios(file.getInputStream(), filename, aeropuertosMap, 0);

        String sql = "INSERT IGNORE INTO envios_dia_a_dia (clave_compuesta, cliente_id, origen_id, destino_id, fecha_creacion, cantidad_maletas, ruta_definida) VALUES (?, ?, ?, ?, ?, ?, 0)";
        
        List<Envio> list = new ArrayList<>(parsedEnvios.values());
        
        // Execute batch insert
        int subBatchSize = 1000;
        for (int i = 0; i < list.size(); i += subBatchSize) {
            List<Envio> subList = list.subList(i, Math.min(i + subBatchSize, list.size()));
            jdbcTemplate.batchUpdate(sql, new org.springframework.jdbc.core.BatchPreparedStatementSetter() {
                @Override
                public void setValues(PreparedStatement ps, int idx) throws SQLException {
                    Envio e = subList.get(idx);
                    ps.setString(1, e.getId()); // claveCompuesta
                    ps.setString(2, e.getIdCliente());
                    ps.setLong(3, dbAeropuertosIds.get(e.getOrigen().getCodigo()));
                    ps.setLong(4, dbAeropuertosIds.get(e.getDestino().getCodigo()));
                    
                    // Save the raw receipt date/time directly (it is already in GMT 0 / simulation time)
                    LocalDateTime localTime = e.getFechaHoraRecepcion();
                    
                    ps.setTimestamp(5, Timestamp.valueOf(localTime));
                    ps.setInt(6, e.getCantidadMaletas());
                }

                @Override
                public int getBatchSize() {
                    return subList.size();
                }
            });
        }
        return list.size();
    }

    @Transactional
    public void crearEnvioDiaADiaManual(String clienteId, String origenCodigo, String destinoCodigo, LocalDateTime fechaCreacionLocal, int cantidadMaletas) {
        AeropuertoEntity origen = aeropuertoRepository.findByCodigo(origenCodigo)
                .orElseThrow(() -> new IllegalArgumentException("Aeropuerto origen " + origenCodigo + " no existe"));
        AeropuertoEntity destino = aeropuertoRepository.findByCodigo(destinoCodigo)
                .orElseThrow(() -> new IllegalArgumentException("Aeropuerto destino " + destinoCodigo + " no existe"));

        int maletasPendientes = envioDiaADiaRepository.sumarMaletasPendientesPorAeropuerto(origenCodigo);
        int capacidadDisponible = origen.getCapacidadMax() - maletasPendientes;

        if (cantidadMaletas > capacidadDisponible) {
            throw new IllegalArgumentException("El envío excede la capacidad del aeropuerto de origen. Capacidad disponible: " + Math.max(0, capacidadDisponible) + " maletas.");
        }

        String uuid = UUID.randomUUID().toString().substring(0, 8);
        String claveCompuesta = origenCodigo + "_MANUAL_" + uuid;

        EnvioDiaADiaEntity entity = new EnvioDiaADiaEntity();
        entity.setClaveCompuesta(claveCompuesta);
        entity.setClienteId(clienteId);
        entity.setOrigen(origen);
        entity.setDestino(destino);
        entity.setFechaCreacion(fechaCreacionLocal);
        entity.setCantidadMaletas(cantidadMaletas);
        entity.setRutaDefinida(false);

        envioDiaADiaRepository.save(entity);
    }

    public List<EnvioDiaADiaEntity> obtenerEnviosDiaADiaTodos() {
        return envioDiaADiaRepository.findAll();
    }

    public Map<String, Envio> obtenerEnviosDiaADiaPendientes(Map<String, Aeropuerto> aeropuertosMap, LocalDateTime limite) {
        List<EnvioDiaADiaEntity> entities = envioDiaADiaRepository.findByRutaDefinidaFalseAndFechaCreacionLessThanEqual(limite);
        Map<String, Envio> enviosMap = new LinkedHashMap<>();
        for (EnvioDiaADiaEntity entity : entities) {
            Aeropuerto origen = aeropuertosMap.get(entity.getOrigen().getCodigo());
            Aeropuerto destino = aeropuertosMap.get(entity.getDestino().getCodigo());
            if (origen != null && destino != null) {
                Envio envio = new Envio(
                        entity.getClaveCompuesta(),
                        entity.getClienteId(),
                        origen,
                        destino,
                        entity.getFechaCreacion(),
                        entity.getCantidadMaletas()
                );
                enviosMap.put(entity.getClaveCompuesta(), envio);
            }
        }
        return enviosMap;
    }

    @Transactional
    public void marcarEnviosComoProcesados(Collection<String> keys) {
        if (keys.isEmpty()) return;
        envioDiaADiaRepository.marcarComoProcesados(keys);
    }

    @Transactional
    public void limpiarEnviosDiaADia() {
        envioDiaADiaRepository.deleteAllInBatch();
    }

    @Transactional
    public void resetAllRutasDefinidas() {
        envioDiaADiaRepository.resetAllRutasDefinidas();
    }
}
