# 🎨 LoadRoute Frontend - Tablero de Control

Interfaz de usuario moderna para la gestión, simulación y monitoreo de la red logística global de LoadRoute.

## 🚀 Tecnologías
- **Next.js 14 (App Router)**
- **React 18**
- **Tailwind CSS**: Estilizado basado en una paleta oscura premium.
- **Leaflet & React-Leaflet**: Motor de mapas interactivo para visualización de rutas geográficas.
- **TypeScript**: Tipado estricto para seguridad en el desarrollo.

## ✨ Características Principales
- **Carga de Datos Maestros**: Interfaz para subir archivos de aeropuertos, vuelos y envíos en formato texto.
- **Simulación en Tiempo Real**: Reloj maestro que permite visualizar el flujo de paquetes minuto a minuto en el mapa.
- **Mapa Interactivo**:
  - Marcadores de aeropuertos que cambian de color según su ocupación.
  - Trazado dinámico de rutas aéreas activas.
  - Modales detallados para inspeccionar el estado de cada aeropuerto y cada vuelo.
- **Leyenda de Estado**: Sistema de semáforo para monitorear la capacidad de los almacenes (Verde/Amarillo/Rojo).

## 📂 Estructura del Proyecto
- `/src/app`: Páginas y layouts principales.
- `/src/components`: Componentes modulares (Mapa, Modales, Panel de Control).
- `/src/services`: Cliente API para comunicación con el backend de optimización.
- `/src/types`: Definiciones de interfaces para el flujo de datos de rutas.

## 🛠️ Instalación y Ejecución

### Requisitos
- Node.js 18+ instalado.

### Comandos
```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev
```
La aplicación estará en `http://localhost:3000`.

## 📍 Guía de Uso
1. **Conexión**: Asegúrate de que el indicador en la pantalla de inicio diga "Backend: Conectado".
2. **Carga**: Sube los archivos maestros necesarios para iniciar la red.
3. **Optimización**: El dashboard mostrará los resultados de los algoritmos ALNS y SA.
4. **Inspección**: Haz clic en los aeropuertos del mapa para ver el detalle de carga actual y capacidad operativa.

---
**Diseñado para operadores logísticos de alta demanda.**
