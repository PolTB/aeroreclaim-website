/**
 * ═══════════════════════════════════════════════════════════════
 * AERORECLAIM — AGENTE 2: LEGAL SCORING ENGINE
 * Versión 1.0 | Marzo 2026
 * 
 * Evalúa automáticamente cada lead del Pre-Validador y decide:
 *   Score ≥ 70  → ACCEPTED  → Onboarding_Queue
 *   Score 40-69 → REVIEW    → Review_Queue  
 *   Score < 40  → REJECTED  → Email al pasajero
 * ═══════════════════════════════════════════════════════════════
 */

// ─── CONFIGURACIÓN ─────────────────────────────────────────────
const CONFIG = {
  SHEET_LEADS:      "Leads",
  SHEET_SCORED:     "Scored_Leads",
  SHEET_REVIEW:     "Review_Queue",
  SHEET_ONBOARDING: "Onboarding_Queue",
  ADMIN_EMAIL:      "info@aeroreclaim.com",
  NOTIFICATION_EMAIL: "ptusquets@gmail.com",
  SCORE_ACCEPT:     70,
  SCORE_REVIEW:     40,
  
  // Columnas del tab Leads (A=1, B=2, etc.)
  // Actual: Timestamp | Nombre | Email | Vuelo | Fecha Vuelo | Aerolínea | Incidencia | Compensación Est. | Estado
  COL: {
    TIMESTAMP:    1,  // A
    NOMBRE:       2,  // B
    EMAIL:        3,  // C
    VUELO:        4,  // D
    FECHA_VUELO:  5,  // E
    AEROLINEA:    6,  // F
    INCIDENCIA:   7,  // G
    COMPENSACION: 8,  // H
    ESTADO:       9,  // I
    SCORED:       10  // J — nueva columna para marcar "procesado"
  }
};

// ─── AEROLÍNEAS: IATA CODE → PERFIL ───────────────────────────
const AIRLINE_CODES = {
  "Iberia": "IB", "Vueling": "VY", "Ryanair": "FR", "Air Europa": "UX",
  "Iberia Express": "I2", "EasyJet": "U2", "Lufthansa": "LH",
  "Air France": "AF", "KLM": "KL", "British Airways": "BA",
  "TAP Portugal": "TP", "Swiss": "LX", "Austrian": "OS",
  "Brussels Airlines": "SN", "LOT Polish": "LO", "Norwegian": "DY",
  "Wizz Air": "W6", "Volotea": "V7", "Jet2": "LS",
  "Pegasus": "PC", "Turkish Airlines": "TK", "Emirates": "EK",
  "Qatar Airways": "QR", "Etihad": "EY", "Transavia": "HV",
  "Eurowings": "EW", "SAS": "SK", "Finnair": "AY",
  "Aer Lingus": "EI", "ITA Airways": "AZ", "Virgin Atlantic": "VS"
};

const AIRLINE_PROFILES = {
  // TIER 1: Pagan sin litigar (score bonus +15)
  "LX": { compliance: "HIGH",   scoreBonus: 15, avgDays: 14,  litigationRate: 0.05 },
  "OS": { compliance: "HIGH",   scoreBonus: 15, avgDays: 21,  litigationRate: 0.08 },
  "LO": { compliance: "HIGH",   scoreBonus: 12, avgDays: 30,  litigationRate: 0.10 },
  "SN": { compliance: "HIGH",   scoreBonus: 15, avgDays: 14,  litigationRate: 0.05 },
  "QR": { compliance: "HIGH",   scoreBonus: 12, avgDays: 21,  litigationRate: 0.08 },
  "EY": { compliance: "HIGH",   scoreBonus: 12, avgDays: 21,  litigationRate: 0.08 },
  "AY": { compliance: "HIGH",   scoreBonus: 10, avgDays: 21,  litigationRate: 0.10 },
  "SK": { compliance: "HIGH",   scoreBonus: 10, avgDays: 30,  litigationRate: 0.12 },

  // TIER 2: Pagan, pero lento o con resistencia (bonus +5)
  "IB": { compliance: "MEDIUM", scoreBonus:  5, avgDays: 60,  litigationRate: 0.25 },
  "VY": { compliance: "MEDIUM", scoreBonus:  3, avgDays: 45,  litigationRate: 0.30 },
  "I2": { compliance: "MEDIUM", scoreBonus:  5, avgDays: 60,  litigationRate: 0.25 },
  "UX": { compliance: "MEDIUM", scoreBonus:  2, avgDays: 60,  litigationRate: 0.35 },
  "BA": { compliance: "MEDIUM", scoreBonus:  5, avgDays: 45,  litigationRate: 0.25 },
  "AF": { compliance: "MEDIUM", scoreBonus:  5, avgDays: 30,  litigationRate: 0.20 },
  "KL": { compliance: "MEDIUM", scoreBonus:  5, avgDays: 30,  litigationRate: 0.20 },
  "TP": { compliance: "MEDIUM", scoreBonus:  5, avgDays: 45,  litigationRate: 0.20 },
  "AZ": { compliance: "MEDIUM", scoreBonus:  3, avgDays: 60,  litigationRate: 0.30 },
  "U2": { compliance: "MEDIUM", scoreBonus:  3, avgDays: 30,  litigationRate: 0.30 },
  "DY": { compliance: "MEDIUM", scoreBonus:  5, avgDays: 30,  litigationRate: 0.20 },
  "VS": { compliance: "MEDIUM", scoreBonus:  8, avgDays: 30,  litigationRate: 0.15 },
  "EI": { compliance: "MEDIUM", scoreBonus:  5, avgDays: 30,  litigationRate: 0.20 },
  "TK": { compliance: "MEDIUM", scoreBonus:  3, avgDays: 60,  litigationRate: 0.30 },
  "EK": { compliance: "MEDIUM", scoreBonus:  5, avgDays: 45,  litigationRate: 0.20 },
  "HV": { compliance: "MEDIUM", scoreBonus:  3, avgDays: 30,  litigationRate: 0.25 },
  "EW": { compliance: "MEDIUM", scoreBonus:  3, avgDays: 45,  litigationRate: 0.30 },

  // TIER 3: Litigan sistemáticamente (penalización −5)
  "FR": { compliance: "LOW",    scoreBonus: -5, avgDays: 90,  litigationRate: 0.65 },
  "W6": { compliance: "LOW",    scoreBonus: -5, avgDays: 90,  litigationRate: 0.60 },
  "LH": { compliance: "LOW",    scoreBonus: -8, avgDays: 120, litigationRate: 0.70 },
  "V7": { compliance: "LOW",    scoreBonus: -3, avgDays: 60,  litigationRate: 0.50 },
  "LS": { compliance: "LOW",    scoreBonus: -3, avgDays: 90,  litigationRate: 0.50 },
  "PC": { compliance: "LOW",    scoreBonus: -5, avgDays: 90,  litigationRate: 0.60 },

  // DEFAULT
  "DEFAULT": { compliance: "UNKNOWN", scoreBonus: 0, avgDays: 60, litigationRate: 0.40 }
};

// EU/EEA country codes
const EU_EEA_CODES = ["ES","FR","DE","IT","PT","NL","BE","AT","SE","DK","FI","PL",
                      "CZ","HU","RO","GR","BG","HR","SK","SI","EE","LV","LT","CY",
                      "MT","LU","IE","NO","IS","LI"];


// ═══════════════════════════════════════════════════════════════
// INSTALAR TRIGGER — Ejecutar UNA SOLA VEZ manualmente
// ═══════════════════════════════════════════════════════════════

function installTrigger() {
  // Eliminar triggers existentes
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "onLeadInserted") {
      ScriptApp.deleteTrigger(t);
    }
  });
  
  // Nuevo trigger: cada vez que cambia el sheet
  ScriptApp.newTrigger("onLeadInserted")
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onChange()
    .create();
  
  Logger.log("✅ Trigger instalado correctamente.");
}


// ═══════════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL — Disparada por trigger onChange
// ═══════════════════════════════════════════════════════════════

function onLeadInserted(e) {
  // Solo procesar inserciones de fila
  if (e && e.changeType !== "INSERT_ROW") return;
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var leadsSheet = ss.getSheetByName(CONFIG.SHEET_LEADS);
  if (!leadsSheet) return;
  
  var lastRow = leadsSheet.getLastRow();
  if (lastRow < 2) return; // Sin datos
  
  // Leer el lead
  var lead = readLead(leadsSheet, lastRow);
  
  // Solo procesar si no ha sido scored ya
  if (lead.scored) return;
  
  try {
    // Ejecutar scoring
    var result = scoreCase(lead);
    
    // Escribir en Scored_Leads
    writeScoredLead(ss, lead, result);
    
    // Acciones según decisión
    if (result.decision === "ACCEPTED") {
      writeOnboardingQueue(ss, lead, result);
      sendAcceptanceNotification(lead, result);
    } else if (result.decision === "REVIEW") {
      writeReviewQueue(ss, lead, result);
      sendReviewNotification(lead, result);
    } else {
      sendRejectionEmail(lead, result);
    }
    
    // Marcar como procesado en Leads
    leadsSheet.getRange(lastRow, CONFIG.COL.SCORED).setValue("SCORED");
    leadsSheet.getRange(lastRow, CONFIG.COL.ESTADO).setValue(result.decision);
    
  } catch(error) {
    Logger.log("❌ Error en scoring: " + error.toString());
    MailApp.sendEmail(
      CONFIG.ADMIN_EMAIL,
      "⚠️ Error Agente 2 AeroReclaim",
      "Lead: " + lead.email + "\nError: " + error.toString() + "\nStack: " + error.stack
    );
    // Marcar para revisión manual
    leadsSheet.getRange(lastRow, CONFIG.COL.ESTADO).setValue("ERROR");
  }
}


// ═══════════════════════════════════════════════════════════════
// LEER LEAD DESDE FILA
// ═══════════════════════════════════════════════════════════════

function readLead(sheet, row) {
  var values = sheet.getRange(row, 1, 1, 10).getValues()[0];
  
  // Extraer código IATA de aerolínea
  var airlineName = String(values[CONFIG.COL.AEROLINEA - 1] || "");
  var airlineCode = AIRLINE_CODES[airlineName] || extractAirlineCode(airlineName);
  
  // Extraer origen/destino del número de vuelo si es posible
  var flightNumber = String(values[CONFIG.COL.VUELO - 1] || "");
  
  // Parsear incidencia
  var incidencia = String(values[CONFIG.COL.INCIDENCIA - 1] || "").toLowerCase();
  var tipoIncidencia = "retraso"; // default
  var horasRetraso = 4; // default
  
  if (incidencia.indexOf("cancel") >= 0) {
    tipoIncidencia = "cancelacion";
    horasRetraso = 99;
  } else if (incidencia.indexOf("overbooking") >= 0 || incidencia.indexOf("embarque") >= 0) {
    tipoIncidencia = "overbooking";
    horasRetraso = 99;
  } else if (incidencia.indexOf("conexi") >= 0) {
    tipoIncidencia = "conexion_perdida";
    horasRetraso = 4;
  } else if (incidencia.indexOf(">3") >= 0 || incidencia.indexOf("3h") >= 0) {
    horasRetraso = 4;
  } else if (incidencia.indexOf(">5") >= 0 || incidencia.indexOf("5h") >= 0) {
    horasRetraso = 6;
  }
  
  return {
    row: row,
    timestamp: values[CONFIG.COL.TIMESTAMP - 1],
    nombre: String(values[CONFIG.COL.NOMBRE - 1] || ""),
    email: String(values[CONFIG.COL.EMAIL - 1] || ""),
    vuelo: flightNumber,
    fechaVuelo: values[CONFIG.COL.FECHA_VUELO - 1],
    aerolinea: airlineName,
    airlineCode: airlineCode,
    incidencia: incidencia,
    tipoIncidencia: tipoIncidencia,
    horasRetraso: horasRetraso,
    compensacionPrev: String(values[CONFIG.COL.COMPENSACION - 1] || ""),
    scored: String(values[9] || "") === "SCORED"
  };
}

function extractAirlineCode(name) {
  // Intentar extraer código de 2 letras del número de vuelo
  for (var key in AIRLINE_CODES) {
    if (name.toLowerCase().indexOf(key.toLowerCase()) >= 0) {
      return AIRLINE_CODES[key];
    }
  }
  return "DEFAULT";
}


// ═══════════════════════════════════════════════════════════════
// DISTANCIA: HAVERSINE + BASE DE AEROPUERTOS
// ═══════════════════════════════════════════════════════════════

function haversineDistance(lat1, lon1, lat2, lon2) {
  var R = 6371;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLon = (lon2 - lon1) * Math.PI / 180;
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLon/2) * Math.sin(dLon/2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

function getAirportDB() {
  var cached = CacheService.getScriptCache().get("AIRPORT_DB");
  if (cached) return JSON.parse(cached);
  
  var db = PropertiesService.getScriptProperties().getProperty("AIRPORT_DB");
  if (db) {
    // Cache for 6 hours
    try { CacheService.getScriptCache().put("AIRPORT_DB", db, 21600); } catch(e) {}
    return JSON.parse(db);
  }
  return {};
}

function getAirportCoords(iataCode) {
  var db = getAirportDB();
  return db[iataCode] || null;
}

function isIntraEU(originIata, destIata) {
  var db = getAirportDB();
  var orig = db[originIata];
  var dest = db[destIata];
  if (!orig || !dest) return false;
  return EU_EEA_CODES.indexOf(orig.country) >= 0 && EU_EEA_CODES.indexOf(dest.country) >= 0;
}

function isEUAirport(iataCode) {
  var db = getAirportDB();
  var ap = db[iataCode];
  if (!ap) return false;
  return EU_EEA_CODES.indexOf(ap.country) >= 0;
}

function calcularCompensacion(distanciaKm, tipoIncidencia, horasRetraso, esIntraUE) {
  if (distanciaKm <= 1500) {
    return { euros: 250, categoria: "corta" };
  }
  if (distanciaKm <= 3500 || esIntraUE) {
    return { euros: 400, categoria: "media" };
  }
  // > 3500 km, no intra-UE
  if (tipoIncidencia === "retraso" && horasRetraso >= 3 && horasRetraso < 4) {
    return { euros: 300, categoria: "larga_reducida" };
  }
  return { euros: 600, categoria: "larga" };
}


// ═══════════════════════════════════════════════════════════════
// VERIFICACIÓN DE VUELO (AERODATABOX API)
// ═══════════════════════════════════════════════════════════════

function verificarVuelo(flightNumber, dateStr) {
  if (!flightNumber || flightNumber.length < 3) {
    return { found: false, source: "NONE", note: "Sin número de vuelo" };
  }
  
  var apiKey = PropertiesService.getScriptProperties().getProperty("AERODATABOX_KEY");
  if (!apiKey) {
    return { found: false, source: "NO_API_KEY", note: "API key no configurada" };
  }
  
  // Formatear fecha
  var fecha = new Date(dateStr);
  var dateFormatted = Utilities.formatDate(fecha, "UTC", "yyyy-MM-dd");
  
  var url = "https://aerodatabox.p.rapidapi.com/flights/number/" + 
            encodeURIComponent(flightNumber) + "/" + dateFormatted;
  
  try {
    var response = UrlFetchApp.fetch(url, {
      method: "GET",
      headers: {
        "X-RapidAPI-Key": apiKey,
        "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com"
      },
      muteHttpExceptions: true
    });
    
    var statusCode = response.getResponseCode();
    
    if (statusCode === 200) {
      var data = JSON.parse(response.getContentText());
      var flight = Array.isArray(data) ? data[0] : data;
      
      if (!flight) return { found: false, source: "AeroDataBox" };
      
      var schedArr = flight.arrival && flight.arrival.scheduledTimeLocal ? 
                     new Date(flight.arrival.scheduledTimeLocal) : null;
      var actArr = flight.arrival && flight.arrival.actualTimeLocal ? 
                   new Date(flight.arrival.actualTimeLocal) : schedArr;
      var delayMin = (schedArr && actArr) ? (actArr - schedArr) / 60000 : 0;
      
      return {
        found: true,
        source: "AeroDataBox",
        origin: flight.departure && flight.departure.airport ? flight.departure.airport.iata : null,
        destination: flight.arrival && flight.arrival.airport ? flight.arrival.airport.iata : null,
        delayMinutes: Math.max(0, delayMin),
        delayHours: Math.max(0, delayMin / 60),
        cancelled: flight.status === "Cancelled",
        status: flight.status
      };
    } else if (statusCode === 404) {
      return { found: false, source: "AeroDataBox", note: "Vuelo no encontrado" };
    } else {
      return { found: false, source: "AeroDataBox", note: "HTTP " + statusCode };
    }
  } catch(err) {
    Logger.log("AeroDataBox error: " + err.toString());
    return { found: false, source: "AeroDataBox", note: err.toString() };
  }
}


// ═══════════════════════════════════════════════════════════════
// SCORING ENGINE — 6 factores, score 0-100
// ═══════════════════════════════════════════════════════════════

function scoreCase(lead) {
  // Intentar verificar vuelo
  var flightData = verificarVuelo(lead.vuelo, lead.fechaVuelo);
  
  // Determinar origen/destino
  var origen = null, destino = null;
  if (flightData.found === true) {
    origen = flightData.origin;
    destino = flightData.destination;
  }
  // Si no tenemos de la API, intentar extraer del número de vuelo y datos del pre-validador
  // El pre-validador actual no envía origen/destino separados, así que usamos lo que hay
  
  // Calcular distancia si tenemos ambos aeropuertos
  var distanciaKm = 0;
  var intraEU = false;
  var origCoords = origen ? getAirportCoords(origen) : null;
  var destCoords = destino ? getAirportCoords(destino) : null;
  
  if (origCoords && destCoords) {
    distanciaKm = haversineDistance(origCoords.lat, origCoords.lon, destCoords.lat, destCoords.lon);
    intraEU = isIntraEU(origen, destino);
  } else {
    // Fallback: usar compensación del pre-validador para estimar distancia
    var compPrev = lead.compensacionPrev;
    if (compPrev.indexOf("600") >= 0) { distanciaKm = 4000; }
    else if (compPrev.indexOf("400") >= 0) { distanciaKm = 2500; }
    else { distanciaKm = 1000; }
    intraEU = true; // Asumir intra-UE por defecto (mercado español)
  }
  
  // Calcular compensación
  var comp = calcularCompensacion(distanciaKm, lead.tipoIncidencia, lead.horasRetraso, intraEU);
  
  // ─── F1: ELEGIBILIDAD BASE (0-30) ───────────────────────────
  var f1 = 0;
  
  // ¿Vuelo verificado?
  if (flightData.found === true) f1 += 10;
  else f1 += 3; // Datos no verificados pero declarados
  
  // ¿Cubierto por CE 261?
  var cubierto = false;
  if (origen && isEUAirport(origen)) { cubierto = true; f1 += 10; }
  else if (destino && isEUAirport(destino)) { cubierto = true; f1 += 8; } // Necesita aerolínea EU
  else { f1 += 5; } // Asumir cubierto (mercado español)
  
  // ¿Retraso suficiente?
  var retrasoVerificado = flightData.found === true ? flightData.delayHours : lead.horasRetraso;
  if (lead.tipoIncidencia === "cancelacion" || lead.tipoIncidencia === "overbooking") {
    f1 += 10; // Siempre elegible
  } else if (retrasoVerificado >= 3) {
    f1 += 10;
  } else if (retrasoVerificado >= 2) {
    f1 += 5; // Borderline
  } else {
    f1 += 0; // No elegible
  }
  
  // ─── F2: TIPO DE INCIDENCIA (0-20) ──────────────────────────
  var f2 = 0;
  switch(lead.tipoIncidencia) {
    case "overbooking":       f2 = 20; break; // Más fácil de ganar
    case "cancelacion":       f2 = 18; break;
    case "retraso":           f2 = 14; break;
    case "conexion_perdida":  f2 = 10; break;
    default:                  f2 = 10; break;
  }
  
  // ─── F3: FUERZA MAYOR (0-20, penalización) ──────────────────
  var f3 = 18; // Empezar optimista, penalizar si hay indicios
  
  // Si la API confirma el vuelo pero NO hay retraso significativo
  if (flightData.found === true && !flightData.cancelled && flightData.delayHours < 2) {
    f3 = 5; // Probablemente no hay caso real
  }
  
  // No podemos verificar fuerza mayor sin datos detallados,
  // así que damos beneficio de la duda al pasajero
  
  // ─── F4: AEROLÍNEA (0-15) ──────────────────────────────────
  var profile = AIRLINE_PROFILES[lead.airlineCode] || AIRLINE_PROFILES["DEFAULT"];
  var f4 = 8; // Base
  f4 = Math.max(0, Math.min(15, f4 + profile.scoreBonus));
  
  // ─── F5: ANTIGÜEDAD (0-10) ─────────────────────────────────
  var f5 = 10;
  var fechaVuelo = new Date(lead.fechaVuelo);
  var hoy = new Date();
  var diasPasados = Math.floor((hoy - fechaVuelo) / (1000 * 60 * 60 * 24));
  var anosPasados = diasPasados / 365;
  
  if (anosPasados > 5) {
    f5 = 0; // Prescrito en España
  } else if (anosPasados > 4) {
    f5 = 2; // Urgente, poco margen
  } else if (anosPasados > 3) {
    f5 = 5;
  } else if (anosPasados > 2) {
    f5 = 7;
  } else if (anosPasados > 1) {
    f5 = 9;
  } else {
    f5 = 10; // Reciente, máximo score
  }
  
  // ─── F6: RECLAMACIÓN PREVIA (0-5) ──────────────────────────
  var f6 = 5; // Sin datos, asumir que no hay reclamación previa
  
  // ─── SCORE TOTAL ───────────────────────────────────────────
  var scoreTotal = f1 + f2 + f3 + f4 + f5 + f6;
  scoreTotal = Math.max(0, Math.min(100, scoreTotal));
  
  // ─── DECISIÓN ──────────────────────────────────────────────
  var decision, motivo;
  
  // Override: prescrito → rechazar siempre
  if (anosPasados > 5) {
    decision = "REJECTED";
    motivo = "Caso prescrito: han pasado más de 5 años desde el vuelo (límite legal en España).";
    scoreTotal = Math.min(scoreTotal, 20);
  }
  // Override: retraso < 3h verificado → rechazar
  else if (flightData.found === true && !flightData.cancelled && flightData.delayHours < 3 && lead.tipoIncidencia === "retraso") {
    decision = "REJECTED";
    motivo = "Retraso verificado de " + flightData.delayHours.toFixed(1) + "h — inferior a las 3h requeridas por CE 261/2004.";
    scoreTotal = Math.min(scoreTotal, 30);
  }
  else if (scoreTotal >= CONFIG.SCORE_ACCEPT) {
    decision = "ACCEPTED";
    motivo = "Caso aceptado automáticamente. Score " + scoreTotal + "/100.";
  }
  else if (scoreTotal >= CONFIG.SCORE_REVIEW) {
    decision = "REVIEW";
    motivo = "Score " + scoreTotal + "/100 — requiere revisión manual. ";
    if (f1 < 15) motivo += "Elegibilidad base baja. ";
    if (f3 < 10) motivo += "Posible fuerza mayor. ";
    if (f4 < 5) motivo += "Aerolínea con alta litigiosidad. ";
  }
  else {
    decision = "REJECTED";
    motivo = "Score " + scoreTotal + "/100 — caso no viable. ";
    if (f1 < 10) motivo += "No cumple requisitos CE 261/2004. ";
    if (f5 < 3) motivo += "Caso muy antiguo. ";
  }
  
  return {
    scoreTotal: scoreTotal,
    f1: f1, f2: f2, f3: f3, f4: f4, f5: f5, f6: f6,
    decision: decision,
    motivo: motivo,
    distanciaKm: Math.round(distanciaKm),
    intraEU: intraEU,
    compensacion: comp.euros,
    categoriaVuelo: comp.categoria,
    vueloVerificado: flightData.found === true,
    fuenteVerificacion: flightData.source || "NONE",
    origen: origen,
    destino: destino,
    casoId: "AR-" + Utilities.formatDate(new Date(), "Europe/Madrid", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000)
  };
}


// ═══════════════════════════════════════════════════════════════
// ESCRITURA EN GOOGLE SHEETS
// ═══════════════════════════════════════════════════════════════

function writeScoredLead(ss, lead, result) {
  var sheet = ss.getSheetByName(CONFIG.SHEET_SCORED);
  sheet.appendRow([
    result.casoId,
    new Date(),
    lead.nombre,
    lead.email,
    lead.vuelo,
    lead.fechaVuelo,
    lead.aerolinea,
    result.origen || "",
    result.destino || "",
    lead.incidencia,
    lead.horasRetraso,
    result.distanciaKm,
    result.intraEU ? "Sí" : "No",
    result.compensacion,
    result.categoriaVuelo,
    result.scoreTotal,
    result.f1, result.f2, result.f3, result.f4, result.f5, result.f6,
    result.decision,
    result.motivo,
    result.vueloVerificado ? "Sí" : "No",
    result.fuenteVerificacion
  ]);
}

function writeOnboardingQueue(ss, lead, result) {
  var sheet = ss.getSheetByName(CONFIG.SHEET_ONBOARDING);
  var honorarios = Math.round(result.compensacion * 0.25 * 1.21 * 100) / 100;
  sheet.appendRow([
    result.casoId,
    new Date(),
    lead.nombre,
    lead.email,
    "", // Teléfono — no lo tenemos en el formulario actual
    lead.vuelo,
    lead.fechaVuelo,
    lead.aerolinea,
    result.origen || "",
    result.destino || "",
    lead.incidencia,
    result.compensacion,
    honorarios,
    result.scoreTotal,
    result.distanciaKm,
    "PENDIENTE"
  ]);
}

function writeReviewQueue(ss, lead, result) {
  var sheet = ss.getSheetByName(CONFIG.SHEET_REVIEW);
  var fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() + 3); // 3 días para revisar
  
  sheet.appendRow([
    result.casoId,
    new Date(),
    lead.nombre,
    lead.email,
    lead.vuelo,
    result.scoreTotal,
    result.motivo,
    CONFIG.ADMIN_EMAIL,
    fechaLimite,
    "", // Decisión manual (vacío)
    ""  // Notas
  ]);
}


// ═══════════════════════════════════════════════════════════════
// EMAILS AUTOMÁTICOS
// ═══════════════════════════════════════════════════════════════

function sendAcceptanceNotification(lead, result) {
  // Notificar al admin
  MailApp.sendEmail(
    CONFIG.NOTIFICATION_EMAIL,
    "✅ Nuevo caso ACEPTADO — " + result.casoId,
    "Caso aceptado automáticamente.\n\n" +
    "Pasajero: " + lead.nombre + "\n" +
    "Email: " + lead.email + "\n" +
    "Vuelo: " + lead.vuelo + " (" + lead.fechaVuelo + ")\n" +
    "Aerolínea: " + lead.aerolinea + "\n" +
    "Compensación: " + result.compensacion + "€\n" +
    "Score: " + result.scoreTotal + "/100\n" +
    "Caso ID: " + result.casoId + "\n\n" +
    "El caso está en la cola de Onboarding."
  );
}

function sendReviewNotification(lead, result) {
  MailApp.sendEmail(
    CONFIG.NOTIFICATION_EMAIL,
    "🔍 Caso para REVISIÓN — " + result.casoId,
    "Caso requiere revisión manual.\n\n" +
    "Pasajero: " + lead.nombre + "\n" +
    "Email: " + lead.email + "\n" +
    "Vuelo: " + lead.vuelo + " (" + lead.fechaVuelo + ")\n" +
    "Aerolínea: " + lead.aerolinea + "\n" +
    "Score: " + result.scoreTotal + "/100\n" +
    "Motivo: " + result.motivo + "\n" +
    "Caso ID: " + result.casoId
  );
}

function sendRejectionEmail(lead, result) {
  // Email al pasajero explicando por qué no podemos tramitar su caso
  if (lead.email && lead.email.indexOf("@") > 0 && lead.email.indexOf("test") < 0) {
    MailApp.sendEmail({
      to: lead.email,
      subject: "AeroReclaim — Resultado de tu consulta",
      htmlBody: 
        "<p>Hola " + lead.nombre + ",</p>" +
        "<p>Gracias por utilizar AeroReclaim para comprobar si tienes derecho a compensación.</p>" +
        "<p>Tras analizar los datos de tu vuelo <strong>" + lead.vuelo + "</strong> del " + lead.fechaVuelo + ", " +
        "lamentamos informarte de que, según nuestra evaluación, tu caso <strong>no reúne los requisitos</strong> " +
        "para tramitar una reclamación con garantías de éxito.</p>" +
        "<p><strong>Motivo:</strong> " + result.motivo + "</p>" +
        "<p>Te recomendamos:</p>" +
        "<ul>" +
        "<li>Intentar reclamar directamente a " + lead.aerolinea + " a través de su web oficial</li>" +
        "<li>Si la rechazan, puedes acudir a la <a href='https://www.seguridadaerea.gob.es/es/ambitos/los-derechos-de-los-pasajeros-aereos/reclamaciones'>AESA</a> (gratuito pero lento)</li>" +
        "</ul>" +
        "<p>Si tu situación cambia o tienes otro vuelo afectado, no dudes en volver a consultarnos en <a href='https://aeroreclaim.com'>aeroreclaim.com</a>.</p>" +
        "<p>Un saludo,<br>El equipo de AeroReclaim</p>"
    });
  }
  
  // Notificar al admin
  MailApp.sendEmail(
    CONFIG.NOTIFICATION_EMAIL,
    "❌ Caso RECHAZADO — " + result.casoId,
    "Caso rechazado automáticamente.\n\n" +
    "Pasajero: " + lead.nombre + " (" + lead.email + ")\n" +
    "Vuelo: " + lead.vuelo + "\n" +
    "Score: " + result.scoreTotal + "/100\n" +
    "Motivo: " + result.motivo
  );
}


// ═══════════════════════════════════════════════════════════════
// TESTING — Ejecutar manualmente para probar
// ═══════════════════════════════════════════════════════════════

function testScoring() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var leadsSheet = ss.getSheetByName(CONFIG.SHEET_LEADS);
  var lastRow = leadsSheet.getLastRow();
  
  var lead = readLead(leadsSheet, lastRow);
  Logger.log("Lead leído: " + JSON.stringify(lead));
  
  var result = scoreCase(lead);
  Logger.log("Resultado: " + JSON.stringify(result, null, 2));
  
  return result;
}

/**
 * Test con datos ficticios sin leer del sheet
 */
function testScoringMock() {
  var lead = {
    row: 2,
    timestamp: new Date(),
    nombre: "Test Pasajero",
    email: "test@example.com",
    vuelo: "IB3456",
    fechaVuelo: "2025-11-15",
    aerolinea: "Iberia",
    airlineCode: "IB",
    incidencia: "retraso >3h",
    tipoIncidencia: "retraso",
    horasRetraso: 4,
    compensacionPrev: "250€",
    scored: false
  };
  
  var result = scoreCase(lead);
  Logger.log("=== TEST MOCK ===");
  Logger.log("Score: " + result.scoreTotal + "/100");
  Logger.log("Decisión: " + result.decision);
  Logger.log("Motivo: " + result.motivo);
  Logger.log("F1=" + result.f1 + " F2=" + result.f2 + " F3=" + result.f3 + 
             " F4=" + result.f4 + " F5=" + result.f5 + " F6=" + result.f6);
  Logger.log("Compensación: " + result.compensacion + "€");
  Logger.log("Full: " + JSON.stringify(result, null, 2));
  
  return result;
}


// ═══════════════════════════════════════════════════════════════
// SETUP: Cargar base de aeropuertos (ejecutar UNA VEZ)
// ═══════════════════════════════════════════════════════════════

/**
 * Ejecutar esta función UNA VEZ para cargar la base de aeropuertos.
 * Se debe pegar el JSON en la variable AIRPORT_DATA_JSON antes de ejecutar.
 * 
 * INSTRUCCIONES:
 * 1. Abrir el archivo airport_db_compact.json
 * 2. Copiar todo el contenido
 * 3. Pegarlo en la variable AIRPORT_DATA_JSON de abajo
 * 4. Ejecutar esta función
 */
function loadAirportDB() {
  // El JSON se carga desde un archivo separado para no saturar este script
  // Ver función loadAirportDBFromURL() como alternativa
  var props = PropertiesService.getScriptProperties();
  
  // Verificar si ya está cargada
  var existing = props.getProperty("AIRPORT_DB");
  if (existing) {
    var count = Object.keys(JSON.parse(existing)).length;
    Logger.log("Base de aeropuertos ya cargada: " + count + " aeropuertos.");
    return;
  }
  
  Logger.log("⚠️ La base de aeropuertos NO está cargada. Ejecuta loadAirportDBFromURL() para cargarla.");
}

/**
 * Carga la base de aeropuertos desde GitHub (4 partes).
 * Ejecutar UNA VEZ para poblar Script Properties.
 */
function loadAirportDBFromURL() {
  var baseUrl = "https://raw.githubusercontent.com/PolTB/aeroreclaim-website/main/data/";
  var parts = ["airports_part_a.json", "airports_part_b.json", "airports_part_c.json", "airports_part_d.json"];
  var merged = {};
  
  for (var i = 0; i < parts.length; i++) {
    var response = UrlFetchApp.fetch(baseUrl + parts[i], { muteHttpExceptions: true });
    if (response.getResponseCode() === 200) {
      var partData = JSON.parse(response.getContentText());
      for (var key in partData) {
        merged[key] = partData[key];
      }
      Logger.log("✅ Cargada " + parts[i] + ": " + Object.keys(partData).length + " aeropuertos");
    } else {
      Logger.log("❌ Error cargando " + parts[i] + ": HTTP " + response.getResponseCode());
    }
  }
  
  var totalKeys = Object.keys(merged).length;
  if (totalKeys > 700) {
    var jsonStr = JSON.stringify(merged);
    PropertiesService.getScriptProperties().setProperty("AIRPORT_DB", jsonStr);
    Logger.log("✅ Base de aeropuertos cargada: " + totalKeys + " aeropuertos (" + jsonStr.length + " bytes)");
  } else {
    Logger.log("⚠️ Solo se cargaron " + totalKeys + " aeropuertos. Esperado: ~787. Revisa las URLs.");
  }
}

function setAirportDB(jsonString) {
  PropertiesService.getScriptProperties().setProperty("AIRPORT_DB", jsonString);
  var count = Object.keys(JSON.parse(jsonString)).length;
  Logger.log("✅ Base de aeropuertos cargada: " + count + " aeropuertos.");
}
