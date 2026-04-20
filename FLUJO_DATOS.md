# Flujo de Datos - LoadRoute PoC

## 🔄 Diagrama de Flujo General

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│                          USUARIO ABRE NAVEGADOR                             │
│                       http://localhost:3000                                 │
│                                                                              │
└──────────────────────────────────┬────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js/React)                            │
│                                                                              │
│  1. page.tsx carga y renderiza:                                            │
│     ├─ Header con título LoadRoute                                         │
│     ├─ Indicador de conexión al backend                                    │
│     ├─ ControlPanel (3 botones)                                            │
│     ├─ VisualizadorRutas (Canvas vacío)                                    │
│     └─ Legend (info de algoritmos)                                         │
│                                                                              │
│  2. useEffect() verifica salud del backend:                                │
│     └─ fetch GET /api/rutas/health                                         │
│        ├─ Si responde: Indicador VERDE ✅                                  │
│        └─ Si falla: Indicador ROJO ❌                                      │
│                                                                              │
└──────────────────────────────────┬────────────────────────────────────────────┘
                                   │
                    USUARIO HACE CLICK: "Simular con SA"
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     ControlPanel.handleSimularSA()                          │
│                                                                              │
│  1. setSate(cargandoSA = true)  ← Botones deshabilitados                   │
│  2. Muestra spinner en botón                                               │
│  3. Llama ruteoService.obtenerRutaSA()                                     │
│                                                                              │
└──────────────────────────────────┬────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                    ruteoService.obtenerRutaSA()                             │
│                                                                              │
│  1. fetch({                                                                │
│       method: 'GET',                                                       │
│       url: 'http://localhost:8080/api/rutas/sa'                            │
│     })                                                                     │
│  2. Envía petición HTTP GET al backend                                    │
│                                                                              │
└──────────────────────────────────┬────────────────────────────────────────────┘
                                   │
                    HTTP GET /api/rutas/sa + CORS headers
                                   │
                   (CORS preflight si es necesario)
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                 BACKEND (Spring Boot Java)                                  │
│                                                                              │
│  CorsConfig.java:                                                          │
│  └─ Intercepta petición                                                    │
│     ├─ Verifica origin = "http://localhost:3000" ✅                        │
│     ├─ Agrega headers CORS-Allow                                           │
│     └─ Pasa petición adelante                                              │
│                                                                              │
└──────────────────────────────────┬────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│              RutasController.ruteoSimulatedAnnealing()                      │
│                                                                              │
│  @GetMapping("/sa")                                                        │
│  public ResponseEntity<RutaResponseDTO> ruteoSimulatedAnnealing(...)       │
│  {                                                                         │
│      // Recibe parámetros opcionales:                                     │
│      // - origen: Long (opcional)                                         │
│      // - destino: Long (opcional)                                        │
│                                                                             │
│      RutaResponseDTO resultado =                                          │
│        simulatedAnnealingService.ejecutarRuteo(origen, destino);          │
│                                                                             │
│      return ResponseEntity.ok(resultado);  // HTTP 200                    │
│  }                                                                         │
│                                                                              │
└──────────────────────────────────┬────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│          SimulatedAnnealingService.ejecutarRuteo()                          │
│                                                                              │
│  1. public RutaResponseDTO ejecutarRuteo(Long origen, Long destino) {      │
│                                                                             │
│  2. // TODO: Implementar lógica real del SA                              │
│     // Por ahora, retorna ruta hardcodeada:                              │
│                                                                             │
│  3. List<Vuelo> rutaMock = generarRutaMock();                            │
│     ├─ Llama obtenerOCrearAeropuerto("SKBO", ...)                        │
│     │  └─ Queries BD: SELECT * FROM aeropuertos WHERE codigo='SKBO'     │
│     │     ├─ Si existe: retorna el entity                                │
│     │     └─ Si no: lo crea y guarda en BD                              │
│     ├─ Llama obtenerOCrearAeropuerto("SEQM", ...)                        │
│     ├─ Crea 4 vuelos entre aeropuertos                                   │
│     └─ Guarda en BD via vueloRepository.save()                           │
│                                                                             │
│  4. Convierte List<Vuelo> a List<VueloDTO>:                              │
│     └─ Para cada vuelo:                                                  │
│        ├─ Extrae origen → convierte a AeropuertoDTO                     │
│        ├─ Extrae destino → convierte a AeropuertoDTO                    │
│        ├─ Copia capacidad                                                │
│        └─ Asigna orden (1, 2, 3, 4)                                      │
│                                                                             │
│  5. Retorna RutaResponseDTO {                                            │
│       algoritmo: "SIMULATED_ANNEALING",                                  │
│       timestamp: LocalDateTime.now(),                                    │
│       vuelos: [ VueloDTO, VueloDTO, ... ],                               │
│       distanciaTotal: 2400.5,                                            │
│       capacidadUtilizada: 150                                            │
│     }                                                                     │
│  }                                                                        │
│                                                                              │
└──────────────────────────────────┬────────────────────────────────────────────┘
                                   │
                    JSON Response + HTTP 200 OK
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                  FRONTEND: Recibe JSON Response                             │
│                                                                              │
│  ruteoService.obtenerRutaSA() {                                            │
│    const data: RutaResponse = await response.json();                       │
│    return data;                                                            │
│  }                                                                         │
│                                                                              │
└──────────────────────────────────┬────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│              ControlPanel.handleSimularSA() - catch response                │
│                                                                              │
│  1. ruta = await obtenerRutaSA()  ← Obtiene RutaResponseDTO               │
│  2. onRutaObtajeda(ruta, 'SA')    ← Callback al padre (page.tsx)         │
│  3. setSate(cargandoSA = false)   ← Habilita botones                     │
│  4. onError('')                  ← Limpia errores                        │
│                                                                              │
└──────────────────────────────────┬────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                 page.tsx: Actualiza state                                   │
│                                                                              │
│  const handleRutaObtajeda = (nuevaRuta, alg) => {                          │
│    setRuta(nuevaRuta);     ← State actualizado                            │
│    setAlgoritmo(alg);      ← Algoritmo actualizado                        │
│  }                                                                         │
│                                                                              │
│  Esto causa re-render de todo el componente y subcomponentes              │
│                                                                              │
└──────────────────────────────────┬────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│           VisualizadorRutas: Recibe nuevas props (ruta, algoritmo)         │
│                                                                              │
│  <VisualizadorRutas ruta={ruta} algoritmo={algoritmo} />                  │
│                                                                              │
│  1. useEffect(() => { ... }, [ruta, algoritmo])                           │
│     └─ Se ejecuta cuando ruta o algoritmo cambian                         │
│                                                                              │
│  2. const canvas = canvasRef.current;                                     │
│  3. const ctx = canvas.getContext('2d');                                  │
│                                                                              │
│  4. Extrae todos los nodos únicos de los vuelos:                          │
│     ├─ SKBO, SEQM, SVMI, SBBR                                            │
│                                                                              │
│  5. Calcula escala (calcularEscala):                                      │
│     ├─ Encuentra min/max latitud y longitud                              │
│     ├─ Calcula range (diferencia)                                        │
│     ├─ Calcula escala para que encaje en canvas (1000x600)               │
│                                                                              │
│  6. Convierte coordenadas geográficas a píxeles:                          │
│     └─ pixelX = desplazamientoX + longitud * escala                      │
│     └─ pixelY = desplazamientoY + latitud * escala                       │
│                                                                              │
│  7. Dibuja líneas (vuelos):                                               │
│     └─ Para cada vuelo:                                                  │
│        ├─ ctx.moveTo(origen.pixelX, origen.pixelY)                       │
│        ├─ ctx.lineTo(destino.pixelX, destino.pixelY)                     │
│        ├─ ctx.stroke() (color púrpura para SA)                           │
│        └─ Escribe número de orden en la mitad de la línea                │
│                                                                              │
│  8. Dibuja nodos (aeropuertos):                                           │
│     └─ Para cada nodo:                                                   │
│        ├─ ctx.arc(pixelX, pixelY, radius=8, ...)  ← Círculo             │
│        ├─ ctx.fill() (color azul)                                        │
│        ├─ ctx.stroke() (borde azul oscuro)                               │
│        ├─ Escribe código del aeropuerto (SKBO, SEQM, etc)               │
│        └─ Escribe nombre debajo                                          │
│                                                                              │
│  9. Renderiza información adicional:                                      │
│     ├─ 4 tarjetas con métricas                                           │
│     └─ Tabla con detalles de vuelos                                      │
│                                                                              │
└──────────────────────────────────┬────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                  USUARIO VE RESULTADO EN PANTALLA                           │
│                                                                              │
│  ✅ Canvas dibujado con:                                                   │
│     ├─ Nodos (círculos azules) en posiciones correctas                     │
│     ├─ Líneas (púrpura) conectando los nodos                              │
│     ├─ Números (1, 2, 3, 4) mostrando orden                               │
│     └─ Etiquetas con códigos ICAO y nombres                               │
│                                                                              │
│  ✅ Información:                                                           │
│     ├─ Tarjeta: "Algoritmo: Simulated Annealing"                          │
│     ├─ Tarjeta: "Vuelos: 4"                                               │
│     ├─ Tarjeta: "Distancia Total: 2400.5 km"                             │
│     ├─ Tarjeta: "Capacidad Usada: 150 maletas"                           │
│     └─ Tabla con detalles de cada vuelo                                   │
│                                                                              │
│  ✅ Botones:                                                               │
│     ├─ "Simular con SA" (nuevamente habilitado)                           │
│     ├─ "Simular con ALNS" (habilitado - para comparar)                    │
│     └─ "Limpiar" (habilitado - para resetear)                             │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Flujo de Datos - Instancia Individual

```json
{
  "frontend_request": {
    "method": "GET",
    "url": "http://localhost:8080/api/rutas/sa",
    "headers": {
      "Content-Type": "application/json",
      "origin": "http://localhost:3000"
    }
  },
  
  "backend_processing": {
    "step_1": "CORS validation",
    "step_2": "Route to RutasController.ruteoSimulatedAnnealing()",
    "step_3": "Inject SimulatedAnnealingService",
    "step_4": "Call service.ejecutarRuteo(null, null)",
    "step_5": "Query database for Aeropuertos, Vuelos",
    "step_6": "Generate route (mock)",
    "step_7": "Convert Entities to DTOs",
    "step_8": "Wrap in RutaResponseDTO",
    "step_9": "Serialize to JSON"
  },
  
  "backend_response": {
    "status": 200,
    "headers": {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "http://localhost:3000",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    },
    "body": {
      "algoritmo": "SIMULATED_ANNEALING",
      "timestamp": "2026-04-15T15:30:45",
      "vuelos": [
        {
          "id": 1,
          "origen": {
            "id": 1,
            "codigo": "SKBO",
            "latitud": 4.701389,
            "longitud": -74.147222,
            "nombre": "Bogota - El Dorado International Airport"
          },
          "destino": {
            "id": 2,
            "codigo": "SEQM",
            "latitud": 0.113333,
            "longitud": -78.358611,
            "nombre": "Quito - Mariscal Sucre International Airport"
          },
          "capacidad": 300,
          "orden": 1
        }
      ],
      "distanciaTotal": 2400.5,
      "capacidadUtilizada": 150
    }
  },
  
  "frontend_processing": {
    "step_1": "receive response",
    "step_2": "check response.ok",
    "step_3": "parse JSON: const data = await response.json()",
    "step_4": "validate types (TypeScript)",
    "step_5": "return RutaResponse",
    "step_6": "update React state",
    "step_7": "trigger re-render",
    "step_8": "VisualizadorRutas recalc layout",
    "step_9": "dibuja en Canvas"
  }
}
```

---

## 🔌 Integración Backend-Frontend

### Request Headers (desde Frontend)
```http
GET /api/rutas/sa HTTP/1.1
Host: localhost:8080
Origin: http://localhost:3000
Content-Type: application/json
Connection: keep-alive
```

### Response Headers (desde Backend)
```http
HTTP/1.1 200 OK
Content-Type: application/json
Access-Control-Allow-Origin: http://localhost:3000
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: *
Access-Control-Allow-Credentials: true
Content-Length: 1234
Date: Tue, 15 Apr 2026 15:30:45 GMT
```

---

## 💾 Flujo de Persistencia (Backend ↔ BD)

```
SimulatedAnnealingService.generarRutaMock()
    │
    ├─► obtenerOCrearAeropuerto("SKBO", ...)
    │   │
    │   ├─► aeropuertoRepository.findByCodigo("SKBO")
    │   │   └─► SELECT * FROM aeropuertos WHERE codigo = 'SKBO'
    │   │       ├─ Si encontrado: return entity
    │   │       └─ Si no: continúa
    │   │
    │   └─► aeropuertoRepository.save(new Aeropuerto(...))
    │       └─► INSERT INTO aeropuertos (codigo, latitud, longitud, nombre)
    │
    ├─► obtenerOCrearAeropuerto("SEQM", ...)
    │   └─► [Igual al anterior]
    │
    ├─► Crea List<Vuelo> con 4 elementos
    │
    └─► Para cada Vuelo:
        └─► vueloRepository.save(vuelo)
            └─► INSERT INTO vuelos (origen_id, destino_id, capacidad)
```

---

## 🎨 Canvas Drawing Pipeline

```
RutaResponse JSON
    │
    ├─► Extract aeropuertos from vuelos
    │   └─ nodosMap: Map<Long, Aeropuerto>
    │
    ├─► Calculate scale & offset
    │   ├─ Find min/max latitud, longitud
    │   ├─ Calc range (maxLat - minLat, maxLon - minLon)
    │   ├─ Calc scale: (widthAvailable / rangeLon), (heightAvailable / rangeLat)
    │   └─ Use smaller scale to maintain aspect ratio
    │
    ├─► Convert geo coords to pixel coords
    │   └─ For each nodo:
    │       ├─ pixelX = offsetX + logitud * escalaFinal
    │       └─ pixelY = offsetY + latitud * escalaFinal
    │
    ├─► Draw lines (vuelos)
    │   └─ For each vuelo:
    │       ├─ ctx.strokeStyle = color (púrpura SA, verde ALNS)
    │       ├─ ctx.moveTo(origen.pixelX, origen.pixelY)
    │       ├─ ctx.lineTo(destino.pixelX, destino.pixelY)
    │       ├─ ctx.stroke()
    │       └─ Write orden number at midpoint
    │
    ├─► Draw circles (aeropuertos)
    │   └─ For each nodo:
    │       ├─ ctx.arc(pixelX, pixelY, radius=8, 0, 2π)
    │       ├─ ctx.fill() [color azul]
    │       ├─ ctx.stroke() [borde oscuro]
    │       ├─ Write codigo (SKBO)
    │       └─ Write nombre (Bogota)
    │
    └─► Render tables & info cards
        └─ Display metrics, flight details
```

---

**Versión:** 0.1.0  
**Fecha:** 20260415
