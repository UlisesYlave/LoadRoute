export const obtenerUbicacionActualPedido = (pedido: any, vuelosMaestros: any[], simMinutos: number) => {
  if (!pedido || !pedido.tramos || pedido.tramos.length === 0) {
    return null;
  }

  // 1. Extraemos el minuto exacto del día actual (de 0 a 1439)
  // Esto elimina el problema de si la simulación va por el Día 1, 2 o 5.
  const minutoDelDiaActual = simMinutos % 1440;

  for (let i = 0; i < pedido.tramos.length; i++) {
    const tramo = pedido.tramos[i];
    
    // Obtenemos las horas de salida y llegada transformadas al minuto del día (0 - 1440)
    // Si tu objeto tramo ya tiene propiedades directas como 'horaSalidaMinutos', úsalas.
    // Si no, las calculamos del absoluto usando también el residuo:
    const salidaMinutos = tramo.salidaMinutosGMT % 1440;
    const llegadaMinutos = tramo.llegadaMinutosGMT % 1440;

    // CASO 1: Está en el aire (El tiempo actual del día cae dentro del rango de vuelo)
    if (minutoDelDiaActual >= salidaMinutos && minutoDelDiaActual <= llegadaMinutos) {
      return { 
        tipo: 'AVION', 
        id: tramo.idAvion || tramo.vueloId || tramo.idVuelo || tramo.id 
      };
    }

    // CASO 2: Está esperando en el aeropuerto de origen de este tramo antes de salir
    if (minutoDelDiaActual < salidaMinutos) {
      return { tipo: 'AEROPUERTO', id: tramo.origen || tramo.codigoOrigen };
    }

    // CASO 3: Conexiones o escalas en aeropuertos intermedios
    if (pedido.tramos[i + 1]) {
      const siguienteTramo = pedido.tramos[i + 1];
      const siguienteSalida = siguienteTramo.salidaMinutosGMT % 1440;
      
      if (minutoDelDiaActual > llegadaMinutos && minutoDelDiaActual < siguienteSalida) {
        return { tipo: 'AEROPUERTO', id: tramo.destino || tramo.codigoDestino };
      }
    }
  }

  // CASO 4: Si ya pasó la hora de llegada del último tramo del día, se encuentra en el destino
  const ultimoTramo = pedido.tramos[pedido.tramos.length - 1];
  return { tipo: 'AEROPUERTO', id: ultimoTramo.destino || ultimoTramo.codigoDestino };
};