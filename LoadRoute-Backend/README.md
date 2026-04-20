# LoadRoute Backend - Spring Boot 3+ API

## Descripción

API REST que expone dos algoritmos de ruteo logístico:
- **Simulated Annealing (SA)**: Metaheurística clásica
- **ALNS (Adaptive Large-Neighborhood Search)**: Metaheurística avanzada

## Requisitos Previos

- **Java 17+** (recomendado: Java 21)
- **Maven 3.8+**
- **Docker & Docker Compose** (para PostgreSQL)

## Estructura del Proyecto

```
LoadRoute-Backend/
├── pom.xml                              # Maven configuration
├── src/main/
│   ├── java/com/loadroute/
│   │   ├── LoadRouteApplication.java    # Aplicación principal
│   │   ├── config/
│   │   │   └── CorsConfig.java          # Configuración CORS
│   │   ├── model/
│   │   │   ├── Aeropuerto.java          # Entity JPA
│   │   │   ├── Vuelo.java               # Entity JPA
│   │   │   └── Envio.java               # Entity JPA
│   │   ├── repository/
│   │   │   ├── AeropuertoRepository.java
│   │   │   └── VueloRepository.java
│   │   ├── service/
│   │   │   ├── RuteoService.java        # Interfaz
│   │   │   ├── SimulatedAnnealingService.java
│   │   │   └── ALNSService.java
│   │   ├── controller/
│   │   │   └── RutasController.java     # REST API
│   │   └── dto/
│   │       └── RutaResponseDTO.java     # DTO para responses
│   └── resources/
│       └── application.yml              # Configuración
```

## Instalación y Ejecución

### 1. Levantar PostgreSQL con Docker

```bash
# Desde la raíz del proyecto LoadRoute
docker-compose up -d postgres
```

Verifica que el contenedor está corriendo:
```bash
docker ps  # Debería mostrar 'loadroute-postgres' RUNNING
```

### 2. Compilar el Backend

```bash
cd LoadRoute-Backend
mvn clean install
```

### 3. Ejecutar el Backend

```bash
mvn spring-boot:run
```

El servidor estará disponible en: **http://localhost:8080**

Verifica que está activo:
```bash
curl http://localhost:8080/api/rutas/health
# Respuesta esperada: "Sistema de Ruteo Logístico - OK"
```

## Endpoints API

### GET /api/rutas/sa
Ejecuta el algoritmo Simulated Annealing

**Parámetros opcionales:**
- `origen` (Long): ID del aeropuerto origen
- `destino` (Long): ID del aeropuerto destino

**Respuesta (200 OK):**
```json
{
  "algoritmo": "SIMULATED_ANNEALING",
  "timestamp": "2024-04-15T10:30:00",
  "vuelos": [
    {
      "id": 1,
      "origen": {
        "id": 1,
        "codigo": "AEPB",
        "latitud": -34.6037,
        "longitud": -58.3816,
        "nombre": "Aeroparque Jorge Newbery"
      },
      "destino": { ... },
      "capacidad": 100,
      "orden": 1
    }
  ],
  "distanciaTotal": 2400.5,
  "capacidadUtilizada": 150
}
```

### GET /api/rutas/alns
Ejecuta el algoritmo ALNS

**Parámetros:** Igual a `/api/rutas/sa`

**Respuesta:** Mismo formato pero con `"algoritmo": "ALNS"`

### GET /api/rutas/health
Verifica que el servidor está activo

**Respuesta:**
```
Sistema de Ruteo Logístico - OK
```

## Configuración

### application.yml

```yaml
server:
  port: 8080

spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/loadroute
    username: loadroute_user
    password: loadroute_pass
  
  jpa:
    hibernate:
      ddl-auto: create-drop  # Recrea tablas (desarrollo)
```

**Notas:**
- En producción, cambiar `ddl-auto` a `validate`
- Usar Flyway/Liquibase para migraciones

## Implementación de Algoritmos (Próximas Fases)

### Fase Actual (PoC)
Los servicios retornan rutas **mocks/hardcodeadas**:
- `SimulatedAnnealingService`: Ruta de ejemplo Buenos Aires → Córdoba → Mendoza → Buenos Aires
- `ALNSService`: Ruta alternativa Buenos Aires → Mendoza → Córdoba → Buenos Aires

### Fase Futura
Implementar la lógica real de los algoritmos:

```java
@Override
public RutaResponseDTO ejecutarRuteo(Long origenId, Long destinoId) {
    // TODO: Implementar lógica real de SA
    // 1. Generar solución inicial (greedy)
    // 2. Loop while temperatura > umbral:
    //    - Generar solución vecina (swap, insert, etc)
    //    - Evaluar cambio de energía
    //    - Aceptar si mejora o con probabilidad e^(-delta/T)
    //    - Disminuir temperatura
    // 3. Retornar mejor solución encontrada
}
```

## Debugging

### Ver logs de Hibernate

En `application.yml`:
```yaml
logging:
  level:
    org.hibernate.SQL: DEBUG
    org.hibernate.type.descriptor.sql.BasicBinder: TRACE
```

### Conectar a PostgreSQL directamente

```bash
docker exec -it loadroute-postgres psql -U loadroute_user -d loadroute

# Queries útiles:
SELECT * FROM aeropuertos;
SELECT * FROM vuelos;
SELECT * FROM envios;
```

## Troubleshooting

| Problema | Solución |
|----------|----------|
| `Connection refused: localhost:5432` | Verifica que `docker-compose up -d` levantó PostgreSQL |
| `Hibernate DDL syntax error` | Asegúrate de usar PostgreSQL 14+ en el contenedor |
| `CORS error from frontend` | Verifica que `CorsConfig` permite `http://localhost:3000` |
| `404 - Endpoint not found` | Verifica que los controladores están anotados con `@RestController` y `@RequestMapping` |

## Próximos Pasos

1. ✅ PoC con mocks (fase actual)
2. 📌 Integrar lógica real de SA (próximo sprint)
3. 📌 Integrar lógica real de ALNS
4. 📌 Agregar persistencia de resultados
5. 📌 Agregar autenticación (JWT)
6. 📌 Agregar documentación Swagger/OpenAPI

---

**Desarrollador:** Braulio  
**Fecha de Creación:** 2024-04-15  
**Versión:** 0.1.0
