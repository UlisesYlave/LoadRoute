# Formato de Datos - LoadRoute PoC

## 📋 Estructura de Datos

### 1. Aeropuertos (PDDS 26-1, 20260404)

**Formato de Código ICAO estándar**

```
CODIGO  CIUDAD              PAÍS        GMT  CAPACIDAD  COORDENADAS (DMS → Decimal)
SKBO    Bogota              Colombia    -5   430        04° 42' 05" N, 74° 08' 49" W → (4.701389, -74.147222)
SEQM    Quito               Ecuador     -5   410        00° 06' 48" N, 78° 21' 31" W → (0.113333, -78.358611)
SVMI    Caracas             Venezuela   -4   400        10° 36' 11" N, 66° 59' 26" W → (10.603056, -66.990556)
SBBR    Brasilia            Brasil      -3   480        15° 51' 53" S, 47° 55' 05" W → (-15.864722, -47.918056)
SPIM    Lima                Perú        -5   440        12° 01' 19" S, 77° 06' 52" W → (-12.021944, -77.114444)
SLLP    La Paz              Bolivia     -4   420        16° 30' 47" S, 68° 11' 32" W → (-16.513056, -68.192222)
SCEL    Santiago de Chile   Chile       -3   460        33° 23' 47" S, 70° 47' 41" W → (-33.396389, -70.794722)
```

**Conversión DMS a Decimal:**
$$\text{Decimal} = \text{Grados} + \frac{\text{Minutos}}{60} + \frac{\text{Segundos}}{3600}$$
- **Negativo** si es Sur (S) u Oeste (W)

### 2. Plan de Vuelo (Flight Schedule)

**Formato:**
```
ORIGEN-DESTINO-SALIDA-LLEGADA-CAPACIDAD
```

**Ejemplo:**
```
SKBO-SEQM-03:34-04:21-0300
SEQM-SKBO-04:29-05:16-0340
```

**Campos:**
- `ORIGEN`: Código ICAO (4 caracteres)
- `DESTINO`: Código ICAO (4 caracteres)
- `SALIDA`: Hora local (HH:MM)
- `LLEGADA`: Hora local (HH:MM)
- `CAPACIDAD`: Número de maletas (formato 4 dígitos, ej: 0300 = 300 maletas)

**Rutas Activas (16 vuelos diarios):**
- SKBO ↔ SEQM: 6 vuelos diarios
- SKBO ↔ SVMI: 6 vuelos diarios
- SKBO ↔ SBBR: 4 vuelos diarios
- **Total:** 16 vuelos diarios

### 3. Envíos (Shipments)

**Formato de Identificación:**
```
id_envío-aaaammdd-hh-mm-dest-###-IdCliente
```

**Ejemplo:**
```
00000001-20260404-01-38-SEQM-006-0007729
```

**Campos:**
| Campo | Descripción | Formato | Ejemplo | Rango |
|-------|-------------|---------|---------|-------|
| `id_envío` | Identificador único | 8 dígitos | 00000001 | 00000001 - 99999999 |
| `aaaammdd` | Fecha del envío | YYYYMMDD | 20260404 | - |
| `hh` | Hora de creación | 2 dígitos | 01, 14, 23 | 00 - 23 |
| `mm` | Minutos de creación | 2 dígitos | 01, 08, 38, 59 | 00 - 59 |
| `dest` | Aeropuerto destino | 4 caracteres ICAO | SEQM, SBBR | SKBO, SEQM, SVMI, SBBR, SPIM, SLLP, SCEL |
| `###` | Cantidad de maletas | 3 dígitos | 006, 089, 999 | 001 - 999 |
| `IdCliente` | ID del cliente | 7 dígitos | 0007729 | 0000001 - 9999999 |

**Estructura en Base de Datos:**
```sql
envios (
  id SERIAL PRIMARY KEY,
  aeropuerto_origen_id BIGINT REFERENCES aeropuertos(id),        -- SKBO (siempre)
  aeropuerto_destino_id BIGINT REFERENCES aeropuertos(id),       -- dest
  cantidad_maletas INTEGER NOT NULL,                              -- ###
  fecha_creacion TIMESTAMP DEFAULT NOW(),                         -- aaaammdd hh:mm
  cliente_id VARCHAR(7),                                          -- IdCliente (futuro)
  numero_pedido VARCHAR(8)                                        -- id_envío (futuro)
)
```

---

## 🏗️ Modelos de Datos (Entities JPA)

### Aeropuerto
```java
@Entity @Table(name = "aeropuertos")
class Aeropuerto {
  Long id;
  String codigo;        // SKBO, SEQM, SVMI, etc
  Double latitud;       // 4.701389 (Bogota)
  Double longitud;      // -74.147222 (Bogota)
  String nombre;        // "Bogota - El Dorado..."
}
```

### Vuelo
```java
@Entity @Table(name = "vuelos")
class Vuelo {
  Long id;
  Aeropuerto origen;    // SKBO
  Aeropuerto destino;   // SEQM
  Integer capacidad;    // 300 (maletas)
}
```

### Envio
```java
@Entity @Table(name = "envios")
class Envio {
  Long id;
  Aeropuerto origen;           // Siempre SKBO en esta fase
  Aeropuerto destino;          // SEQM, SVMI, etc
  Integer cantidadMaletas;     // 006
  LocalDateTime fechaCreacion; // aaaammdd hh:mm
}
```

---

## 📊 Datos Cargados en init.sql

**Aeropuertos:** 7 (Sudamérica)
**Vuelos:** 16 (plan de vuelo)
**Envíos:** 6 (ejemplos de carga)

---

## 🔄 Flujo de Datos en la PoC

```
1. User abre http://localhost:3000
2. Frontend hace GET /api/rutas/sa
3. Backend SimulatedAnnealingService querys:
   - SELECT * FROM aeropuertos
   - SELECT * FROM vuelos
   - SELECT * FROM envios
4. Genera una ruta optimizada (mock)
5. Retorna RutaResponseDTO con:
   - algoritmo: "SIMULATED_ANNEALING"
   - vuelos: [ {origen: SKBO, destino: SEQM, ...}, ... ]
   - distanciaTotal: 2400.5 km
   - capacidadUtilizada: 150 maletas
6. Frontend dibuja en Canvas:
   - Nodos: SKBO, SEQM, SVMI, SBBR, SPIM, SLLP, SCEL
   - Líneas: Rutas conectando aeropuertos
```

---

## 🎯 Próximas Integraciones

### Fase 2: Carga de Envíos
- API endpoint: `POST /api/envios/cargar`
- Acepta archivo CSV o JSON con lista de envíos
- Formato: id_envío-aaaammdd-hh-mm-dest-###-IdCliente
- Almacena en tabla `envios`

### Fase 3: Optimización Real
- `SimulatedAnnealingService`: Implementa lógica verdadera
  - Recibe: aeropuertos, vuelos, envíos
  - Retorna: ruta optimizada que minimiza:
    - Distancia total
    - Tiempo total
    - Costo operativo
- `ALNSService`: Implementación menos costosa computacionalmente

### Fase 4: Reportes
- Exportar rutas a CSV
- Generar PDF con detalles
- Comparar performance SA vs ALNS

---

## 📝 Notas Técnicas

1. **Coordenadas:** Todas convertidas de DMS a decimales para uso en cálculos de distancia (Haversine)
2. **Capacidad:** En maletas (puede ser reemplazado por kg, m³, etc)
3. **Zona Horaria:** Cada aeropuerto tiene su GMT (UTC-5, UTC-4, UTC-3)
4. **Escalabilidad:** Estructura permite agregar más:
   - Aeropuertos (sin límite)
   - Vuelos (sin límite, pero consultas lentas si > 10,000)
   - Envíos (sin límite, usa índices en BD)

---

**Versión:** 0.1.0  
**Fecha:** 20260415  
**Estado:** Datos cargados, PoC lista para iniciar
