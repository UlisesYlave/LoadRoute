# ⚙️ LoadRoute Backend - Motor de Optimización

Este es el motor central de LoadRoute, encargado de procesar grandes volúmenes de datos logísticos y generar rutas óptimas utilizando metaheurísticas de vanguardia.

## 🚀 Tecnologías
- **Java 17 & Spring Boot 3.x**
- **Maven**: Gestión de dependencias y construcción.
- **JUnit 5**: Pruebas unitarias para validación algorítmica.

## 🧠 Algoritmos Implementados

### 1. ALNS (Adaptive Large Neighborhood Search)
El algoritmo principal para planificación masiva. Utiliza operadores de destrucción y reparación para explorar el espacio de soluciones de forma adaptativa.
- **Destrucción**: Random Removal, Worst Removal, Related Removal.
- **Reparación**: Greedy Insertion, Regret-2 Insertion.

### 2. Simulated Annealing (SA)
Utilizado para optimización en tiempo real y refinamiento de soluciones iniciales.
- **Parámetros**: Temperatura inicial, tasa de enfriamiento (alfa) y criterio de aceptación de Metrópolis.

## 📂 Datos de Entrada
El backend procesa tres archivos maestros que deben cargarse desde el frontend:
- `aeropuertos.txt`: Lista de nodos con coordenadas y capacidad de almacenamiento.
- `planes_vuelo.txt`: Catálogo de vuelos disponibles con horarios y capacidad de carga.
- `envios.txt`: Órdenes de carga con origen, destino y cantidad de maletas.

## 🛠️ Instalación y Compilación

### Requisitos
- JDK 17 o superior.
- Maven instalado en el PATH.

### Comandos de Construcción
```bash
# Limpiar y compilar
mvn clean compile

# Ejecutar pruebas unitarias
mvn test

# Ejecutar la aplicación
mvn spring-boot:run
```

## 📍 Endpoints Principales
- `POST /api/ruteo/ejecutar`: Orquesta el proceso completo de carga y optimización.
- `GET /api/ruteo/health`: Verifica el estado del servicio.

## 📊 Reglas de Negocio Aplicadas
- **SLA**: 24h para vuelos continentales / 48h para intercontinentales.
- **Buffer de Conexión**: Mínimo 30 minutos entre tramos para asegurar transbordos.
- **Capacidad Estricta**: No se permite exceder la capacidad de carga del avión (penalización severa).
- **Capacidad de Almacén**: Los aeropuertos tienen un límite físico de maletas en custodia.

---
**Mantenido por el Equipo de Optimización de LoadRoute.**
