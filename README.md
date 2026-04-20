# LoadRoute - PoC Sistema de Planificación y Ruteo Logístico

**Prueba de Concepto (PoC) de un Sistema Completo de Planificación Logística con Algoritmos de Optimización**

## 📋 Descripción General

LoadRoute es un sistema Full-Stack para la planificación y ruteo de envíos logísticos. Compara dos algoritmos de optimización metaheurística:

- **Simulated Annealing (SA)**: Metaheurística clásica inspirada en el enfriamiento del acero
- **ALNS**: Adaptive Large-Neighborhood Search, una metaheurística más avanzada y adaptativa

### Stack Tecnológico

```
┌─────────────────────────────────────────────────────────────┐
│                          Frontend                            │
│    Next.js 14 | React 18 | TypeScript | Tailwind CSS       │
│              Visualizador Canvas (SVG)                       │
│                  http://localhost:3000                       │
└────────────────────────┬────────────────────────────────────┘
                         │
                    HTTP REST
                    (CORS enabled)
                         │
                         ▼
┌────────────────────────────────────────────────────────────┐
│                       Backend                               │
│    Spring Boot 3+ | Java 17+ | JPA/Hibernate             │
│   GET /api/rutas/sa  (Simulated Annealing)                │
│   GET /api/rutas/alns (ALNS Algorithm)                    │
│                  http://localhost:8080                      │
└────────────────────────┬─────────────────────────────────┘
                         │
                   JDBC / Hibernate
                         │
                         ▼
┌────────────────────────────────────────────────────────────┐
│                   Database Layer                            │
│     PostgreSQL 16 | Docker | SQL                          │
│      localhost:5432 | loadroute database                   │
└────────────────────────────────────────────────────────────┘
```

## 🎯 Objetivo

Crear un esqueleto funcional modular y expandible que permita:
1. **Fase PoC (actual)**: Validar flujo completo con mocks
2. **Fase Real**: Reemplazar servicios mock con algoritmos verdaderos
3. **Fase Escalado**: Agregar persistencia, autenticación, reportes

## 📁 Estructura de Carpetas

```
LoadRoute/
│
├── docker-compose.yml                        [PostgreSQL + Config]
├── init.sql                                  [Datos iniciales]
├── README.md                                 [Este archivo]
│
├── LoadRoute-Backend/                        [Spring Boot API]
│   ├── pom.xml
│   ├── README.md                             [Backend Docs]
│   └── src/main/java/com/loadroute/
│       ├── LoadRouteApplication.java         [Main]
│       ├── config/
│       │   └── CorsConfig.java
│       ├── model/
│       │   ├── Aeropuerto.java              [Entity]
│       │   ├── Vuelo.java                   [Entity]
│       │   └── Envio.java                   [Entity]
│       ├── repository/
│       │   ├── AeropuertoRepository.java    [JPA Repo]
│       │   └── VueloRepository.java
│       ├── service/
│       │   ├── RuteoService.java            [Interface]
│       │   ├── SimulatedAnnealingService.java
│       │   └── ALNSService.java
│       ├── controller/
│       │   └── RutasController.java         [REST API]
│       └── dto/
│           └── RutaResponseDTO.java
│   └── src/main/resources/
│       └── application.yml
│
└── LoadRoute-Frontend/                       [Next.js UI]
    ├── package.json
    ├── README.md                             [Frontend Docs]
    ├── tailwind.config.ts
    ├── next.config.ts
    ├── tsconfig.json
    └── src/
        ├── app/
        │   ├── page.tsx                      [Home Page]
        │   ├── layout.tsx
        │   └── globals.css
        ├── components/
        │   ├── VisualizadorRutas.tsx        [Canvas Drawer]
        │   ├── ControlPanel.tsx              [Buttons]
        │   └── Legend.tsx
        ├── services/
        │   └── ruteoService.ts               [API Client]
        ├── types/
        │   └── rutas.ts                      [TypeScript Interfaces]
        ├── config/
        │   └── constants.ts                  [URLs, Colors, etc]
        └── public/                           [Static Assets]
```

## 🚀 Quick Start

### Requisitos Previos

```bash
# Backend
- Java 17+ (test con: java -version)
- Maven 3.8+ (test con: mvn -v)
- Docker & Docker Compose (test con: docker --version)

# Frontend
- Node.js 18+ (test con: node -v)
- npm 9+ (test con: npm -v)
```

### 1. Iniciar Base de Datos (PostgreSQL)

```bash
cd LoadRoute
docker-compose up -d

# Verificar
docker ps  # Debería mostrar loadroute-postgres RUNNING
```

### 2. Iniciar Backend (Spring Boot)

En otra terminal:

```bash
cd LoadRoute-Backend
mvn clean install
mvn spring-boot:run

# Verificar
curl http://localhost:8080/api/rutas/health
# Respuesta: "Sistema de Ruteo Logístico - OK"
```

### 3. Iniciar Frontend (Next.js)

En otra terminal:

```bash
cd LoadRoute-Frontend
npm install
npm run dev

# Abre http://localhost:3000 en el navegador
```

### 4. Usar la Aplicación

1. Verifica que el header muestre "✅ Backend ACTIVO"
2. Haz clic en "Simular con SA" → Se dibuja una ruta en púrpura
3. Haz clic en "Simular con ALNS" → Se dibuja una ruta en verde
4. Observa la tabla con detalles de vuelos
5. Haz clic en "Limpiar" para resetear

## 🏗️ Arquitectura

### Backend: Patrones y Diseño

**Pattern: Layered Architecture**
```
Controller Layer     (RutasController)
    ↓
Service Layer       (RuteoService + Implementaciones)
    ↓
Repository Layer    (AeropuertoRepository, VueloRepository)
    ↓
Database Layer      (PostgreSQL JPA/Hibernate)
```

**Pattern: Strategy Pattern**
- Interfaz `RuteoService`
- Dos implementaciones: `SimulatedAnnealingService`, `ALNSService`
- Permite agregar .nuevos algoritmos sin cambiar Controller

**Pattern: DTO**
- Entities JPA (`Aeropuerto`, `Vuelo`, `Envio`) ≠ DTOs (`RutaResponseDTO`)
- Desacopla persistencia de API responses

### Frontend: Patrones y Diseño

**Next.js 14 App Router**: 
- `src/app/page.tsx` = página principal
- `src/app/layout.tsx` = layout global

**Client Components**:
- `VisualizadorRutas.tsx`, `ControlPanel.tsx`, `Legend.tsx` con `'use client'`
- State management con `useState`

**Custom Hooks**:
- `useEffect` para verificar salud del backend

**Visualización Canvas**:
- Dibuja nodos y líneas basado en coordenadas geográficas
- Auto-scaling para encajar todos los puntos
- Sin dependencias externas (verdadero SVG/Canvas nativo)

## 🧪 APIs Disponibles

### GET /api/rutas/sa
Ejecuta Simulated Annealing

```bash
curl http://localhost:8080/api/rutas/sa
```

**Respuesta:**
```json
{
  "algoritmo": "SIMULATED_ANNEALING",
  "timestamp": "2024-04-15T10:30:00",
  "vuelos": [
    {
      "id": 1,
      "origen": { "id": 1, "codigo": "AEPB", "latitud": -34.6037, "longitud": -58.3816, "nombre": "..." },
      "destino": { ... },
      "capacidad": 100,
      "orden": 1
    },
    ...
  ],
  "distanciaTotal": 2400.5,
  "capacidadUtilizada": 150
}
```

### GET /api/rutas/alns
Ejecuta ALNS (mismo formato que SA)

### GET /api/rutas/health
Verifica que servidor está activo

```bash
curl http://localhost:8080/api/rutas/health
# Respuesta: "Sistema de Ruteo Logístico - OK"
```

## 📊 Base de Datos

### Tablas

```sql
-- Aeropuertos (nodos)
CREATE TABLE aeropuertos (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(10) UNIQUE NOT NULL,
  latitud DECIMAL NOT NULL,
  longitud DECIMAL NOT NULL,
  nombre VARCHAR(255)
);

-- Vuelos (aristas/rutas)
CREATE TABLE vuelos (
  id SERIAL PRIMARY KEY,
  aeropuerto_origen_id BIGINT REFERENCES aeropuertos(id),
  aeropuerto_destino_id BIGINT REFERENCES aeropuertos(id),
  capacidad INTEGER NOT NULL
);

-- Envíos (carga)
CREATE TABLE envios (
  id SERIAL PRIMARY KEY,
  aeropuerto_origen_id BIGINT REFERENCES aeropuertos(id),
  aeropuerto_destino_id BIGINT REFERENCES aeropuertos(id),
  cantidad_maletas INTEGER NOT NULL,
  fecha_creacion TIMESTAMP DEFAULT NOW()
);
```

**Datos Iniciales:** 10 aeropuertos argentinos pre-cargados en `init.sql`

## 🔄 Flujo de Datos

```
Usuario click "Simular SA"
    ↓
Frontend: ControlPanel.handleSimularSA()
    ↓
Frontend: fetch GET /api/rutas/sa
    ↓
Backend: RutasController.ruteoSimulatedAnnealing()
    ↓
Backend: SimulatedAnnealingService.ejecutarRuteo()
    ↓
Backend: Genera RutaResponseDTO con vuelos mock
    ↓
Backend: Retorna JSON
    ↓
Frontend: recibe JSON → actualiza state → re-render
    ↓
Frontend: VisualizadorRutas dibuja Canvas
    ↓
Usuario ve ruta en pantalla
```

## 🎨 Colores y Styling

| Elemento | Color | Código |
|----------|-------|--------|
| Nodos (Aeropuertos) | Azul | `#3B82F6` |
| Rutas SA | Púrpura | `#8B5CF6` |
| Rutas ALNS | Verde | `#10B981` |
| Botón SA | Púrpura | `bg-purple-600` |
| Botón ALNS | Verde | `bg-green-600` |

## 📝 Notas de Implementación

### Fase PoC (Actual)
- ✅ Estructura base creada
- ✅ APIs funcionando
- ✅ Servicios retornan datos mock
- ✅ Visualizador Canvas dibuja correctamente
- ✅ CORS configurado
- ✅ PostgreSQL integrado

### Próximas Fases

**Fase 1: Algoritmos Reales (2-4 semanas)**
- Implementar lógica real de Simulated Annealing en `SimulatedAnnealingService`
- Implementar lógica real de ALNS en `ALNSService`
- Agregar parámetros configurables (temperatura inicial, cooling rate, etc)
- Agregar métricas (tiempo ejecución, iteraciones, mejora %t)

**Fase 2: Features Avanzadas (4-8 semanas)**
- Persistencia de resultados en BD
- Caché de resultados similares
- Endpoint para cargar datos propios (CSV de envíos)
- Endpoint para comparar algoritmos
- Autenticación con JWT
- Documentación Swagger/OpenAPI

**Fase 3: UI/UX Mejorada**
- Comparación side-by-side SA vs ALNS
- Filtros avanzados
- Exportar resultados (CSV, PDF, JSON)
- Integración con mapas reales (Google Maps / Mapbox)
- Dashboard con estadísticas

## 🐛 Troubleshooting

**❌ Backend INACTIVO**
```bash
# Verifica que Spring Boot está corriendo
netstat -tuln | grep 8080
# Si no aparece, ejecuta: cd LoadRoute-Backend && mvn spring-boot:run
```

**❌ Error CORS desde Frontend**
```bash
# Verifica CorsConfig.java permite localhost:3000
# Si no, actualiza allowedOrigins() en CorsConfig
```

**❌ PostgreSQL Connection Refused**
```bash
# Verifica contenedor
docker ps | grep loadroute-postgres
# Si no aparece: docker-compose up -d
# Ver logs: docker logs loadroute-postgres
```

**❌ Canvas vacío/sin dibujo**
- Abre DevTools (F12) → Console
- Busca errores de JavaScript
- Verifica que Backend retorna `vuelos: [ ... ]` con datos
- Verifica que latitud/longitud son números válidos

## 📚 Recursos Útiles

- [Spring Boot Documentación](https://spring.io/projects/spring-boot)
- [Next.js 14 Documentación](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [PostgreSQL Documentación](https://www.postgresql.org/docs/)
- [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)

## 📞 Contacto y Soporte

Para dudas sobre:
- **Backend**: Ver [LoadRoute-Backend/README.md](LoadRoute-Backend/README.md)
- **Frontend**: Ver [LoadRoute-Frontend/README.md](LoadRoute-Frontend/README.md)

## 📄 Licencia

Proyecto de código abierto. Usa libremente.

---

**Versión:** 0.1.0  
**Última actualización:** 2024-04-15  
**Estado:** ✅ PoC Funcional - Listo para expansión
