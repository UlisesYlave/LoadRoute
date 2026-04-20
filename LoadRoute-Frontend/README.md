# LoadRoute Frontend - Next.js 14 + React

## Descripción

Interfaz web moderna para visualizar y comparar resultados de algoritmos de ruteo logístico (SA vs ALNS).

**Features:**
- 🎨 Visualizador interactivo con Canvas (sin dependencias pesadas)
- 🔗 Consumo de APIs REST del backend Spring Boot
- 📊 Comparación visual de dos algoritmos simultáneamente
- ⚡ Built con Next.js 14 App Router + TypeScript
- 🎯 Estilos Tailwind CSS (sin componentes UI pesados)

## Requisitos Previos

- **Node.js 18+** (recomendado: Node 20 LTS)
- **npm** o **bun** (package manager)
- **Backend Spring Boot corriendo** en http://localhost:8080

## Estructura del Proyecto

```
LoadRoute-Frontend/
├── package.json                         # Dependencias
├── next.config.ts                       # Configuración Next.js
├── tailwind.config.ts                   # Configuración Tailwind
├── tsconfig.json                        # TypeScript config
├── src/
│   ├── app/
│   │   ├── page.tsx                     # Página principal (Home)
│   │   ├── layout.tsx                   # Layout global
│   │   └── globals.css                  # Estilos globales
│   ├── components/
│   │   ├── VisualizadorRutas.tsx        # Canvas: dibuja nodos y rutas
│   │   ├── ControlPanel.tsx             # Botones de simulación
│   │   └── Legend.tsx                   # Información de algoritmos
│   ├── services/
│   │   └── ruteoService.ts              # Cliente HTTP (fetch)
│   ├── types/
│   │   └── rutas.ts                     # Interfaces TypeScript
│   └── config/
│       └── constants.ts                 # URLs, colores, constantes
└── public/                              # Assets estáticos
```

## Instalación y Ejecución

### 1. Instalar Dependencias

```bash
cd LoadRoute-Frontend
npm install
```

O si prefieres usar Bun:
```bash
bun install
```

### 2. Configurar Variables de Ambiente

Crea un archivo `.env.local` en la raíz del frontend (opcional):

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8080
```

Si no lo creas, usa el default: `http://localhost:8080`

### 3. Ejecutar en Modo Desarrollo

```bash
npm run dev
```

La aplicación estará disponible en: **http://localhost:3000**

Abre la URL en el navegador. Deberías ver:
- Header con título "LoadRoute - PoC Sistema Logístico"
- Indicador de conexión al backend (verde si está OK)
- Panel de control con botones: "Simular SA", "Simular ALNS", "Limpiar"
- Área vacía de visualizador (esperando clicar un botón)

### 4. Usar la Aplicación

1. **Verifica que el backend está corriendo** (puerto 8080)
2. **Haz clic en "Simular con SA"** → Verás una ruta dibujada en púrpura
3. **Haz clic en "Simular con ALNS"** → Verás una ruta dibujada en verde
4. **Haz clic en "Limpiar"** → Se limpia el visualizador

## Componentes

### VisualizadorRutas.tsx
Componente principal que:
- Dibuja **nodos** (círculos azules) = aeropuertos
- Dibuja **líneas** = vuelos/rutas
- Usa la coordenada geográfica (lat/lon) de cada aeropuerto
- Escala automáticamente para que todo sea visible
- Muestra **orden de ejecución** en cada línea
- Renderiza tabla con detalles de cada vuelo

**Props:**
- `ruta: RutaResponse | null` - Datos de la ruta a dibujar
- `algoritmo: 'SA' | 'ALNS' | null` - Algoritmo usado

### ControlPanel.tsx
Panel con:
- Botón "Simular SA" (púrpura)
- Botón "Simular ALNS" (verde)
- Botón "Limpiar" (gris)
- Spinner durante carga
- Leyenda de colores

**Props:**
- `onRutaObtajeda: (ruta: RutaResponse, algoritmo: 'SA' | 'ALNS') => void`
- `onError: (error: string) => void`

### Legend.tsx
Muestra información sobre los algoritmos y tips de uso.

## Servicio ruteoService.ts

Funciones helpers para consumir la API:

```typescript
// Obtener ruta con Simulated Annealing
const ruta = await obtenerRutaSA();

// Obtener ruta con ALNS
const ruta = await obtenerRutaALNS();

// Verificar salud del backend
const backendActivo = await verificarSaludBackend();
```

## Tipos TypeScript (types/rutas.ts)

```typescript
interface Aeropuerto {
  id: number;
  codigo: string;        // AEPB, SAAC, etc
  latitud: number;       // -34.6037
  longitud: number;      // -58.3816
  nombre: string;        // Aeroparque Jorge Newbery
}

interface Vuelo {
  id: number;
  origen: Aeropuerto;
  destino: Aeropuerto;
  capacidad: number;     // Maletas
  orden: number;         // Orden en la ruta (1, 2, 3...)
}

interface RutaResponse {
  algoritmo: 'SIMULATED_ANNEALING' | 'ALNS';
  timestamp: string;
  vuelos: Vuelo[];
  distanciaTotal: number;
  capacidadUtilizada: number;
}
```

## Configuración

### constants.ts

Define URLs, colores y constantes:

```typescript
export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';

export const COLORS = {
  NODE_FILL: '#3B82F6',        // Azul para nodos
  LINE_SA: '#8B5CF6',          // Púrpura para SA
  LINE_ALNS: '#10B981',        // Verde para ALNS
};

export const CANVAS_CONFIG = {
  WIDTH: 1000,
  HEIGHT: 600,
  NODE_RADIUS: 8,
};
```

## Build para Producción

```bash
npm run build
npm start
```

Esto genera una build optimizada en `.next/` y la sirve.

## Troubleshooting

| Problema | Solución |
|----------|----------|
| "Backend INACTIVO" en header | Verifica que Spring Boot corre en puerto 8080 |
| Error de CORS en consola | Verifica `CorsConfig.java` en backend |
| Canvas vacío | Verifica que Backend retorna vuelos (no lista vacía) |
| Rutas no dibujan correctamente | Verifica que los datos tienen latitud/longitud válidas |
| Botones deshabilitados | Espera a que la carga anterior termine |

## Debugging

### Ver peticiones HTTP

Abre DevTools (F12) → Pestaña "Network":
- Haz clic en "Simular SA"
- Verás una petición GET a `http://localhost:8080/api/rutas/sa`
- Inspecciona la respuesta JSON

### Ver errores de JavaScript

DevTools → Pestaña "Console":
- Busca mensajes rojos (errores)
- Los catch de las funciones imprimen `console.error(error)`

## Próximos Pasos

1. ✅ PoC con visualizador Canvas (fase actual)
2. 📌 Agregar filtros (por origen, destino)
3. 📌 Comparación side-by-side de SA vs ALNS
4. 📌 Exportar resultados (CSV, PDF)
5. 📌 Integrar mapas reales (Google Maps / Mapbox) si se desea
6. 📌 Agregar autenticación

---

**Desarrollador:** Braulio  
**Fecha de Creación:** 2024-04-15  
**Versión:** 0.1.0
