package com.loadroute.repository;

import com.loadroute.entity.EnvioDiaADiaEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

@Repository
public interface EnvioDiaADiaRepository extends JpaRepository<EnvioDiaADiaEntity, Long> {
    
    List<EnvioDiaADiaEntity> findByRutaDefinidaFalse();
    
    List<EnvioDiaADiaEntity> findByRutaDefinidaFalseAndFechaCreacionLessThanEqual(LocalDateTime limit);
    
    boolean existsByOrigen_IdOrDestino_Id(Long origenId, Long destinoId);
    
    @Modifying
    @Transactional
    @Query("UPDATE EnvioDiaADiaEntity e SET e.rutaDefinida = true WHERE e.claveCompuesta IN :claves")
    void marcarComoProcesados(@Param("claves") Collection<String> claves);

    @Modifying
    @Transactional
    @Query("UPDATE EnvioDiaADiaEntity e SET e.rutaDefinida = false")
    void resetAllRutasDefinidas();

    @Query("SELECT COALESCE(SUM(e.cantidadMaletas), 0) FROM EnvioDiaADiaEntity e WHERE e.origen.codigo = :origenCodigo AND e.rutaDefinida = false")
    int sumarMaletasPendientesPorAeropuerto(@Param("origenCodigo") String origenCodigo);
}
