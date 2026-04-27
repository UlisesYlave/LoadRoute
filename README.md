# 🏢 LoadRoute - Optimización Logística Global
<div align="center">
<img height="150" alt="logo" src="https://github.com/user-attachments/assets/f29acc42-bdab-42aa-bb28-7758760c4f06" />
</div>

Sistema avanzado de planificación y ruteo basado en metaheurísticas para la optimización de transporte de carga aérea.

![Preview Dashboard](https://img.shields.io/badge/Status-Functional-emerald)
![Tech Backend](https://img.shields.io/badge/Backend-Java_17_%7C_Spring_Boot_3-red)
![Tech Frontend](https://img.shields.io/badge/Frontend-Next.js_14_%7C_Tailwind-blue)

## 🎯 Propósito
LoadRoute es una plataforma diseñada para resolver el problema de ruteo de envíos internacionales bajo restricciones estrictas de tiempo (SLA) y capacidad. El sistema permite cargar planes de vuelo, aeropuertos y envíos para generar rutas óptimas que minimizan el tiempo de tránsito y penalizan el incumplimiento de capacidad tanto en aviones como en almacenes.

## 🚀 Tecnologías Utilizadas

### Core & Algoritmos (Backend)
- **Java 17 & Spring Boot 3.2**: Base robusta para el motor de optimización.
- **ALNS (Adaptive Large Neighborhood Search)**: Algoritmo de vecindad variable para explorar soluciones complejas.
- **Simulated Annealing (SA)**: Metaheurística de enfriamiento para escapar de óptimos locales.
- **Temporal Occupancy Engine**: Seguimiento exacto minuto a minuto de la carga en cada aeropuerto.

### Interfaz & Visualización (Frontend)
- **Next.js 14 (App Router)**: Framework de React para una experiencia fluida.
- **Tailwind CSS**: Estilizado moderno con estética premium.
- **Leaflet & React-Leaflet**: Visualización geoespacial de rutas y flotas en tiempo real.
- **Lucide Icons**: Iconografía profesional.

<img width="1600" height="830" alt="image" src="https://github.com/user-attachments/assets/dfb6e6af-3631-464d-a2ac-301eb03a3c98" />

## 🧠 Características del Algoritmo
El motor de ruteo actual implementa reglas de negocio avanzadas:
- **Restricciones de Capacidad**: Control estricto de maletas por vuelo y por almacén de aeropuerto.
- **Penalizaciones Soft**: Se permiten excesos críticos bajo una penalización de costo muy alta para mantener la factibilidad.
- **Lógica de Almacenamiento**: Los paquetes solo ocupan espacio en el origen y aeropuertos de escala, liberando capacidad inmediatamente al llegar a su destino final.
- **Optimización de SLA**: Diferenciación automática entre vuelos intercontinentales (48h) e intracontinentales (24h).

## 🛠️ Instalación y Ejecución

### Requisitos Previos
- **JDK 17** o superior.
- **Node.js 18** o superior.
- **Maven 3.8+**.

### Paso 1: Configurar el Backend
```bash
# Navegar al directorio
cd LoadRoute-Backend

# Compilar el proyecto
mvn clean install

# Ejecutar el servidor
mvn spring-boot:run
```
El servidor estará disponible en `http://localhost:8080`.

### Paso 2: Configurar el Frontend
```bash
# Navegar al directorio
cd LoadRoute-Frontend

# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev
```
Accede a la interfaz en `http://localhost:3000`.

## 📁 Estructura del Proyecto
- **/LoadRoute-Backend**: Código fuente de la API y el motor algorítmico.
- **/LoadRoute-Frontend**: Dashboard de usuario y visualización de mapas.
- **/docs**: (Opcional) Documentación adicional sobre los algoritmos ALNS/SA.

## 📄 Formato de Datos
El sistema consume datos a través de archivos `.txt`:
1. **Aeropuertos**: Coordenadas, zona horaria (GMT) y capacidad de almacén.
2. **Planes de Vuelo**: Rutas diarias con horarios locales y capacidad de carga.
3. **Envíos**: Pedidos masivos con origen, destino y cantidad de maletas.

---
**Desarrollado como PoC de Alta Performance para Logística Internacional.**
