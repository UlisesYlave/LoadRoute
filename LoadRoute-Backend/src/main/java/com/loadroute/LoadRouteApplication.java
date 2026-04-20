package com.loadroute;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Aplicación principal de LoadRoute - PoC de Sistema de Planificación Logística
 * 
 * Expone APIs REST para algoritmos de ruteo:
 * - GET /api/rutas/sa (Simulated Annealing)
 * - GET /api/rutas/alns (ALNS - Adaptive Large-Neighborhood Search)
 */
@SpringBootApplication
public class LoadRouteApplication {

    public static void main(String[] args) {
        SpringApplication.run(LoadRouteApplication.class, args);
    }
}
