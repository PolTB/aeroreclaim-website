/**
 * ═══════════════════════════════════════════════════════════════
 * AERORECLAIM — AGENTE 4: RECLAMACIÓN EXTRAJUDICIAL
 * Versión 1.0 | Marzo 2026
 * 
 * Gestiona el proceso completo de reclamación extrajudicial:
 *   1. Detecta casos LISTO_EXTRAJUDICIAL en Onboarding_Queue
 *   2. Genera y envía carta formal a aerolínea (ES/EN)
 *   3. Monitoriza respuestas de aerolíneas en Gmail
 *   4. Envía recordatorio D+15, ultimátum D+25, auto-escalada D+30
 *   5. Clasifica respuestas y notifica al pasajero
 * 
 * TRIGGERS NECESARIOS (instalar con installExtrajudicialTriggers()):
 *   - processNewExtrajudicialCases: cada 5 min
 *   - processAirlineResponses: cada 15 min
 *   - processDeadlines: diario a las 10:00
 * 
 * COSTE: 0€/mes — todo sobre Google Workspace existente
 * ═══════════════════════════════════════════════════════════════
 */

// ─── CONFIGURACIÓN ─────────────────────────────────────────────
var EX_CONFIG = {
  SPREADSHEET_ID: '10zEyvd3P57DidwOi2UM1VnXHDnPrIWMnpTSbdZ4zX-E',
  SHEETS: {
    ONBOARDING_QUEUE:    'Onboarding_Queue',
    EXTRAJUDICIAL_QUEUE: 'Extrajudicial_Queue',
    AIRLINE_DATABASE:    'Airline_Database',
    LOG:                 'Agent4_Log'
  },
  AERORECLAIM_EMAIL: 'info@aeroreclaim.com',
  AERORECLAIM_NAME:  'AeroReclaim Solutions',
  NOTIFICATION_EMAIL: 'ptusquets@gmail.com',
  
  // Status values
  STATUS: {
    ONBOARDING_READY:    'LISTO_EXTRAJUDICIAL',
    ONBOARDING_SENT:     'ENVIADO_EXTRAJUDICIAL',
    PENDING:             'PENDIENTE_ENVIO',
    SENT:                'RECLAMACION_ENVIADA',
    WAITING:             'ESPERANDO_RESPUESTA',
    REMINDER_15:         'REMINDER_15D_ENVIADO',
    ULTIMATUM_25:        'ULTIMATUM_25D_ENVIADO',
    RESPONSE_RECEIVED:   'RESPUESTA_RECIBIDA',
    ACCEPTED:            'ACEPTADA',
    PARTIAL_OFFER:       'OFERTA_PARCIAL',
    REJECTED:            'RECHAZADA',
    ESCALATED_AESA:      'ESCALADA_AESA',
    COLLECTION_PENDING:  'COBRO_PENDIENTE',
    CLOSED_SUCCESS:      'CERRADO_EXITOSO',
    CLOSED_FAIL:         'CERRADO_SIN_EXITO',
    MANUAL_REVIEW:       'REQUIERE_REVISION_MANUAL',
    ERROR:               'ERROR_ENVIO'
  },
  
  // Plazos en días
  DEADLINES: {
    REMINDER_DAYS:    15,
    ULTIMATUM_DAYS:   25,
    ESCALATE_DAYS:    30
  },
  
  // Dominios de aerolíneas para búsqueda en Gmail
  AIRLINE_DOMAINS: {
    'VY': 'vueling.com', 'IB': 'iberia.com', 'I2': 'iberiaexpress.com',
    'FR': 'ryanair.com', 'UX': 'air-europa.com', 'U2': 'easyjet.com',
    'DY': 'norwegian.com', 'V7': 'volotea.com', 'TO': 'transavia.com',
    'W6': 'wizzair.com', 'NT': 'bintercanarias.com', 'AF': 'airfrance.fr',
    'LH': 'lufthansa.com', 'BA': 'ba.com', 'AZ': 'ita-airways.com'
  }
};


// ═══════════════════════════════════════════════════════════════
// MÓDULO 1: PROCESAMIENTO DE NUEVOS CASOS (trigger cada 5 min)
// ═══════════════════════════════════════════════════════════════

function processNewExtrajudicialCases() {
  var ss = SpreadsheetApp.openById(EX_CONFIG.SPREADSHEET_ID);
  var onboardingSheet = ss.getSheetByName(EX_CONFIG.SHEETS.ONBOARDING_QUEUE);
  var extrajudicialSheet = ss.getSheetByName(EX_CONFIG.SHEETS.EXTRAJUDICIAL_QUEUE);
  var airlineDbSheet = ss.getSheetByName(EX_CONFIG.SHEETS.AIRLINE_DATABASE);
  
  if (!onboardingSheet || !extrajudicialSheet || !airlineDbSheet) {
    logAction_(ss, 'SYSTEM', 'ERROR', 'Falta alguna pestaña requerida');
    return;
  }
  
  var onboardingData = onboardingSheet.getDataRange().getValues();
  if (onboardingData.length < 2) return;
  
  var headers = onboardingData[0];
  var colStatus = findCol_(headers, 'status');
  var colCaseId = findCol_(headers, 'case_id');
  
  if (colStatus < 0 || colCaseId < 0) {
    logAction_(ss, 'SYSTEM', 'ERROR', 'Columnas status/case_id no encontradas en Onboarding_Queue');
    return;
  }
  
  var processedCount = 0;
  
  for (var i = 1; i < onboardingData.length; i++) {
    var row = onboardingData[i];
    
    if (row[colStatus] !== EX_CONFIG.STATUS.ONBOARDING_READY) continue;
    
    var caseId = row[colCaseId];
    if (!caseId) continue;
    
    // Deduplicación: verificar que no existe ya en Extrajudicial_Queue
    if (caseExistsInExtrajudicial_(extrajudicialSheet, caseId)) {
      logAction_(ss, caseId, 'SKIP', 'Caso ya existe en Extrajudicial_Queue');
      // Marcar como enviado igualmente para no volver a intentar
      onboardingSheet.getRange(i + 1, colStatus + 1).setValue(EX_CONFIG.STATUS.ONBOARDING_SENT);
      continue;
    }
    
    try {
      // Extraer todos los datos del caso desde Onboarding_Queue
      var caseData = extractCaseDataFromOnboarding_(row, headers, ss);
      
      // Validar datos obligatorios
      var validation = validateCaseData_(caseData);
      if (!validation.valid) {
        logAction_(ss, caseId, 'VALIDATION_ERROR', validation.error);
        sendInternalAlert_(caseId, 'ERROR VALIDACIÓN: ' + validation.error);
        continue;
      }
      
      // Obtener configuración de la aerolínea
      var airlineConfig = getAirlineConfig_(airlineDbSheet, caseData.airline_iata);
      
      // Actualizar airline_name del DB si lo tenemos
      if (airlineConfig.airline_name && airlineConfig.airline_name !== caseData.airline_iata) {
        caseData.airline_name = airlineConfig.airline_name;
      }
      
      // Determinar método de envío
      if (airlineConfig.claim_method === 'EMAIL' || 
          airlineConfig.claim_method === 'EMAIL_PRIORITY') {
        
        // Generar carta de reclamación
        var language = airlineConfig.language || 'ES';
        var claimLetter = buildClaimLetter_(caseData, language);
        
        // Enviar email a aerolínea
        var gmailResult = sendClaimByEmail_(caseData, airlineConfig, claimLetter);
        
        // Crear registro en Extrajudicial_Queue
        var extrajudicialRow = createExtrajudicialRecord_(
          caseData, airlineConfig, gmailResult
        );
        extrajudicialSheet.appendRow(extrajudicialRow);
        
        // Actualizar Onboarding_Queue → ENVIADO_EXTRAJUDICIAL
        onboardingSheet.getRange(i + 1, colStatus + 1)
          .setValue(EX_CONFIG.STATUS.ONBOARDING_SENT);
        
        // Notificar al pasajero
        sendPassengerClaimSentNotification_(caseData, airlineConfig);
        
        logAction_(ss, caseId, 'CLAIM_SENT', 
          'Reclamación enviada a ' + airlineConfig.claim_email);
        
      } else {
        // WEBFORM_MANUAL: crear registro y alertar para intervención humana
        var manualRow = createExtrajudicialRecordManual_(caseData, airlineConfig);
        extrajudicialSheet.appendRow(manualRow);
        
        // Actualizar Onboarding_Queue
        onboardingSheet.getRange(i + 1, colStatus + 1)
          .setValue(EX_CONFIG.STATUS.ONBOARDING_SENT);
        
        sendInternalAlert_(caseId, 
          'ACCIÓN MANUAL REQUERIDA: ' + airlineConfig.airline_name + 
          ' requiere formulario web.\nURL: ' + (airlineConfig.claim_form_url || 'N/A') +
          '\nPasajero: ' + caseData.passenger_name +
          '\nVuelo: ' + caseData.flight_number + ' ' + caseData.flight_date +
          '\nCompensación: ' + caseData.compensation_eur + '€');
        
        logAction_(ss, caseId, 'MANUAL_REQUIRED', 
          airlineConfig.airline_name + ' requiere formulario web');
      }
      
      processedCount++;
      Utilities.sleep(2000); // Respetar límites de Gmail API
      
    } catch (error) {
      logAction_(ss, caseId, 'ERROR', error.toString());
      sendInternalAlert_(caseId, 'ERROR procesando caso: ' + error.toString());
    }
  }
  
  if (processedCount > 0) {
    logAction_(ss, 'SYSTEM', 'BATCH_COMPLETE', 
      'Procesados ' + processedCount + ' casos nuevos');
  }
}


// ═══════════════════════════════════════════════════════════════
// MÓDULO 2: PROCESAMIENTO DE RESPUESTAS (trigger cada 15 min)
// ═══════════════════════════════════════════════════════════════

function processAirlineResponses() {
  var ss = SpreadsheetApp.openById(EX_CONFIG.SPREADSHEET_ID);
  var extrajudicialSheet = ss.getSheetByName(EX_CONFIG.SHEETS.EXTRAJUDICIAL_QUEUE);
  
  if (!extrajudicialSheet) return;
  
  var data = extrajudicialSheet.getDataRange().getValues();
  if (data.length < 2) return;
  
  var headers = data[0];
  
  // Columnas relevantes
  var cols = {
    caseId:        findCol_(headers, 'case_id'),
    status:        findCol_(headers, 'status'),
    threadId:      findCol_(headers, 'claim_gmail_thread_id'),
    sentDate:      findCol_(headers, 'claim_sent_date'),
    airlineIata:   findCol_(headers, 'airline_iata'),
    flightNumber:  findCol_(headers, 'flight_number'),
    compensationEur: findCol_(headers, 'compensation_eur'),
    passengerEmail: findCol_(headers, 'passenger_email'),
    passengerName: findCol_(headers, 'passenger_name'),
    airlineName:   findCol_(headers, 'airline_name')
  };
  
  // Status activos que necesitan monitorización
  var ACTIVE_STATUSES = [
    EX_CONFIG.STATUS.WAITING,
    EX_CONFIG.STATUS.REMINDER_15,
    EX_CONFIG.STATUS.ULTIMATUM_25
  ];
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var status = row[cols.status];
    
    if (ACTIVE_STATUSES.indexOf(status) === -1) continue;
    
    var caseId = row[cols.caseId];
    var threadId = row[cols.threadId];
    var sentDate = new Date(row[cols.sentDate]);
    
    if (isNaN(sentDate.getTime())) continue;
    
    try {
      // Buscar respuesta via thread ID (método primario)
      var responseEmail = null;
      
      if (threadId) {
        responseEmail = findResponseInThread_(threadId, sentDate);
      }
      
      // Fallback: buscar por keywords en Gmail
      if (!responseEmail) {
        var flightNumber = row[cols.flightNumber];
        var airlineIata = row[cols.airlineIata];
        responseEmail = findResponseByKeyword_(caseId, flightNumber, airlineIata, sentDate);
      }
      
      if (!responseEmail) continue; // Sin respuesta aún
      
      // Clasificar la respuesta
      var classification = classifyAirlineResponse_(responseEmail.body);
      
      // Extraer importe si es oferta parcial
      var offeredAmount = extractOfferedAmount_(responseEmail.body);
      
      // Actualizar la hoja con los datos de respuesta
      updateResponseInSheet_(extrajudicialSheet, i + 1, headers,
        responseEmail.date, classification.type, offeredAmount,
        classification.notes, responseEmail.id);
      
      // Determinar nuevo status según clasificación
      var newStatus = null;
      var compensation = row[cols.compensationEur];
      
      switch (classification.type) {
        case 'ACEPTACION_TOTAL':
          newStatus = EX_CONFIG.STATUS.ACCEPTED;
          notifyPassengerAcceptance_(row, cols, offeredAmount || compensation);
          sendInternalAlert_(caseId, 'ACEPTADA por ' + row[cols.airlineName] + 
            '. Importe: ' + (offeredAmount || compensation) + '€');
          break;
          
        case 'ACEPTACION_PARCIAL':
          // Si oferta >= 80% del reclamado, aceptar
          if (offeredAmount && offeredAmount >= compensation * 0.8) {
            newStatus = EX_CONFIG.STATUS.ACCEPTED;
            notifyPassengerAcceptance_(row, cols, offeredAmount);
          } else {
            newStatus = EX_CONFIG.STATUS.PARTIAL_OFFER;
            sendInternalAlert_(caseId, 
              'OFERTA PARCIAL: ' + offeredAmount + '€ vs ' + compensation + '€ reclamado. Revisar.');
          }
          break;
          
        case 'OFERTA_PARCIAL':
          newStatus = EX_CONFIG.STATUS.PARTIAL_OFFER;
          sendInternalAlert_(caseId, 
            'OFERTA PARCIAL/VOUCHER de ' + row[cols.airlineName] + 
            '. Importe ofrecido: ' + (offeredAmount || '?') + '€. Revisión manual.');
          break;
          
        case 'RECHAZO':
          newStatus = EX_CONFIG.STATUS.REJECTED;
          notifyPassengerRejection_(row, cols);
          sendInternalAlert_(caseId, 'RECHAZO de ' + row[cols.airlineName] + 
            '. Preparar escalada AESA.');
          break;
          
        default:
          // No clasificado → requiere revisión manual
          sendInternalAlert_(caseId, 
            'Respuesta NO CLASIFICADA de ' + row[cols.airlineName] + '. Revisar manualmente.');
      }
      
      // Actualizar status si hay nueva clasificación
      if (newStatus) {
        extrajudicialSheet.getRange(i + 1, cols.status + 1).setValue(newStatus);
        extrajudicialSheet.getRange(i + 1, findCol_(headers, 'status_updated_at') + 1)
          .setValue(new Date());
      }
      
      logAction_(ss, caseId, 'RESPONSE_PROCESSED', 'Tipo: ' + classification.type);
      Utilities.sleep(1000);
      
    } catch (error) {
      logAction_(ss, caseId, 'ERROR_RESPONSE', error.toString());
    }
  }
}


// ═══════════════════════════════════════════════════════════════
// MÓDULO 3: GESTIÓN DE PLAZOS Y ESCALADAS (trigger diario 10:00)
// ═══════════════════════════════════════════════════════════════

function processDeadlines() {
  var ss = SpreadsheetApp.openById(EX_CONFIG.SPREADSHEET_ID);
  var extrajudicialSheet = ss.getSheetByName(EX_CONFIG.SHEETS.EXTRAJUDICIAL_QUEUE);
  
  if (!extrajudicialSheet) return;
  
  var data = extrajudicialSheet.getDataRange().getValues();
  if (data.length < 2) return;
  
  var headers = data[0];
  var today = new Date();
  
  var cols = {
    caseId:          findCol_(headers, 'case_id'),
    status:          findCol_(headers, 'status'),
    sentDate:        findCol_(headers, 'claim_sent_date'),
    reminder15Sent:  findCol_(headers, 'reminder_15d_sent'),
    reminder15Date:  findCol_(headers, 'reminder_15d_date'),
    ultimatum25Sent: findCol_(headers, 'ultimatum_25d_sent'),
    ultimatum25Date: findCol_(headers, 'ultimatum_25d_date'),
    deadline30d:     findCol_(headers, 'deadline_30d'),
    escDate:         findCol_(headers, 'escalation_aesa_date'),
    statusUpdated:   findCol_(headers, 'status_updated_at'),
    passengerEmail:  findCol_(headers, 'passenger_email'),
    passengerName:   findCol_(headers, 'passenger_name'),
    airlineName:     findCol_(headers, 'airline_name'),
    flightNumber:    findCol_(headers, 'flight_number'),
    flightDate:      findCol_(headers, 'flight_date'),
    compensationEur: findCol_(headers, 'compensation_eur'),
    incidentType:    findCol_(headers, 'incident_type'),
    claimEmailSentTo: findCol_(headers, 'claim_email_sent_to')
  };
  
  var ACTIVE_STATUSES = [
    EX_CONFIG.STATUS.WAITING,
    EX_CONFIG.STATUS.REMINDER_15,
    EX_CONFIG.STATUS.ULTIMATUM_25
  ];
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var status = row[cols.status];
    if (ACTIVE_STATUSES.indexOf(status) === -1) continue;
    
    var caseId = row[cols.caseId];
    var sentDate = new Date(row[cols.sentDate]);
    if (isNaN(sentDate.getTime())) continue;
    
    var daysSinceSent = Math.floor((today - sentDate) / (1000 * 60 * 60 * 24));
    
    try {
      // ─── D+30: AUTO ESCALADA A AESA ────────────────────────
      if (daysSinceSent >= EX_CONFIG.DEADLINES.ESCALATE_DAYS && 
          status !== EX_CONFIG.STATUS.ESCALATED_AESA) {
        
        extrajudicialSheet.getRange(i + 1, cols.status + 1)
          .setValue(EX_CONFIG.STATUS.ESCALATED_AESA);
        extrajudicialSheet.getRange(i + 1, cols.statusUpdated + 1).setValue(today);
        extrajudicialSheet.getRange(i + 1, cols.escDate + 1).setValue(today);
        
        // FIX AER-BUG2: NO notificar al pasajero aquí.
        // La notificación se delega a AESAAgent (Agent 5) DESPUÉS de que
        // validateAESAEligibility_() confirme que el caso es elegible.
        // Si Agent 5 lo marca NOT_ELIGIBLE, el pasajero NO recibe notificación
        // y se genera solo una alerta interna.
        // notifyPassengerEscalation_(row, cols);  ← ELIMINADO
        
        sendInternalAlert_(caseId, 
          'AUTO-ESCALADA a AESA: ' + row[cols.airlineName] + ' no respondió en 30 días.\n' +
          'Vuelo: ' + row[cols.flightNumber] + ' | Pasajero: ' + row[cols.passengerName] + '\n' +
          'Importe: ' + row[cols.compensationEur] + '€\n' +
          'PENDIENTE: AESAAgent validará elegibilidad y notificará al pasajero si procede.\n' +
          'ACCIÓN (si elegible): Presentar reclamación ante AESA (seguridadaerea.gob.es)');
        
        logAction_(ss, caseId, 'AUTO_ESCALATED', 'D+' + daysSinceSent + ': escalada automática a AESA — notificación al pasajero pendiente de validación AESAAgent');
      }
      // ─── D+25: ULTIMÁTUM ─────────────────────────────────────
      else if (daysSinceSent >= EX_CONFIG.DEADLINES.ULTIMATUM_DAYS && 
               !row[cols.ultimatum25Sent]) {
        
        sendUltimatumEmail_(row, cols);
        
        extrajudicialSheet.getRange(i + 1, cols.ultimatum25Sent + 1).setValue(true);
        extrajudicialSheet.getRange(i + 1, cols.ultimatum25Date + 1).setValue(today);
        extrajudicialSheet.getRange(i + 1, cols.status + 1)
          .setValue(EX_CONFIG.STATUS.ULTIMATUM_25);
        extrajudicialSheet.getRange(i + 1, cols.statusUpdated + 1).setValue(today);
        
        logAction_(ss, caseId, 'ULTIMATUM_SENT', 'D+' + daysSinceSent);
      }
      // ─── D+15: RECORDATORIO ──────────────────────────────────
      else if (daysSinceSent >= EX_CONFIG.DEADLINES.REMINDER_DAYS && 
               !row[cols.reminder15Sent]) {
        
        sendReminderEmail_(row, cols);
        
        extrajudicialSheet.getRange(i + 1, cols.reminder15Sent + 1).setValue(true);
        extrajudicialSheet.getRange(i + 1, cols.reminder15Date + 1).setValue(today);
        extrajudicialSheet.getRange(i + 1, cols.status + 1)
          .setValue(EX_CONFIG.STATUS.REMINDER_15);
        extrajudicialSheet.getRange(i + 1, cols.statusUpdated + 1).setValue(today);
        
        logAction_(ss, caseId, 'REMINDER_SENT', 'D+' + daysSinceSent);
      }
      
      Utilities.sleep(500);
      
    } catch (error) {
      logAction_(ss, caseId, 'ERROR_DEADLINE', error.toString());
    }
  }
}


// ═══════════════════════════════════════════════════════════════
// MÓDULO 4: FUNCIONES DE DATOS Y EXTRACCIÓN
// ═══════════════════════════════════════════════════════════════

/**
 * Extraer datos del caso desde una fila de Onboarding_Queue
 */
function extractCaseDataFromOnboarding_(row, headers, ss) {
  var get = function(colName) { 
    var idx = findCol_(headers, colName);
    return idx >= 0 ? (row[idx] || '') : ''; 
  };
  
  var flightNumber = get('flight_number') || get('vuelo');
  var airlineIata = get('airline_iata') || get('airline_code') || extractAirlineFromFlight_(flightNumber);
  
  return {
    case_id:            get('case_id') || get('caso_id'),
    passenger_name:     get('passenger_name') || get('nombre'),
    passenger_email:    get('passenger_email') || get('email'),
    passenger_dni:      get('passenger_dni') || get('dni'),
    passenger_iban:     get('passenger_iban') || get('iban'),
    passenger_phone:    get('passenger_phone') || get('telefono'),
    airline_iata:       airlineIata,
    airline_name:       get('airline_name') || get('aerolinea') || airlineIata,
    flight_number:      flightNumber,
    flight_date:        get('flight_date') || get('fecha_vuelo'),
    origin_iata:        get('origin_iata') || get('origen'),
    destination_iata:   get('destination_iata') || get('destino'),
    incident_type:      get('incident_type') || get('incidencia'),
    delay_hours:        parseFloat(get('delay_hours')) || 0,
    distance_km:        parseInt(get('distance_km')) || 0,
    compensation_eur:   parseInt(get('compensation_amount') || get('compensacion')) || 
                        calculateCompensation_(parseInt(get('distance_km'))),
    booking_reference:  get('booking_reference') || get('pnr'),
    mandate_date:       get('mandate_signed_date') || get('mandato_fecha'),
    mandate_drive_url:  get('mandate_drive_url') || get('mandato_url'),
    boarding_pass_url:  get('boarding_pass_url'),
    legal_score:        parseInt(get('legal_score') || get('score')) || 0
  };
}

/**
 * Validar datos obligatorios de un caso
 */
function validateCaseData_(caseData) {
  if (!caseData.case_id) return { valid: false, error: 'case_id vacío' };
  if (!caseData.passenger_name) return { valid: false, error: 'passenger_name vacío' };
  if (!caseData.passenger_email) return { valid: false, error: 'passenger_email vacío' };
  if (!caseData.passenger_dni) return { valid: false, error: 'passenger_dni vacío' };
  if (!caseData.passenger_iban) return { valid: false, error: 'passenger_iban vacío' };
  if (!caseData.flight_number) return { valid: false, error: 'flight_number vacío' };
  if (!caseData.flight_date) return { valid: false, error: 'flight_date vacío' };
  if (!caseData.incident_type) return { valid: false, error: 'incident_type vacío' };
  if (!caseData.mandate_drive_url) return { valid: false, error: 'mandate_drive_url vacío' };
  return { valid: true };
}

/**
 * Extraer código IATA de aerolínea del número de vuelo (VY1234 → VY)
 */
function extractAirlineFromFlight_(flightNumber) {
  if (!flightNumber) return '';
  var match = String(flightNumber).match(/^([A-Z]{2})/);
  return match ? match[1] : '';
}

/**
 * Calcular compensación según distancia (CE 261/2004, Art. 7)
 */
function calculateCompensation_(distanceKm) {
  if (!distanceKm || distanceKm <= 0) return 250;
  if (distanceKm <= 1500) return 250;
  if (distanceKm <= 3500) return 400;
  return 600;
}

/**
 * Obtener configuración de aerolínea desde Airline_Database
 */
function getAirlineConfig_(airlineDbSheet, iataCode) {
  var data = airlineDbSheet.getDataRange().getValues();
  var headers = data[0];
  
  for (var i = 1; i < data.length; i++) {
    var dbIata = data[i][findCol_(headers, 'airline_iata')];
    if (dbIata === iataCode) {
      return {
        airline_iata:      dbIata,
        airline_name:      data[i][findCol_(headers, 'airline_name')] || iataCode,
        claim_method:      data[i][findCol_(headers, 'claim_method')] || 'WEBFORM_MANUAL',
        claim_email:       data[i][findCol_(headers, 'claim_email')] || '',
        claim_form_url:    data[i][findCol_(headers, 'claim_form_url')] || '',
        language:          data[i][findCol_(headers, 'language')] || 'ES',
        avg_response_days: data[i][findCol_(headers, 'avg_response_days')] || 30
      };
    }
  }
  
  // Default si no se encuentra la aerolínea
  return {
    airline_iata:   iataCode,
    airline_name:   iataCode,
    claim_method:   'WEBFORM_MANUAL',
    claim_email:    '',
    claim_form_url: '',
    language:       'EN',
    avg_response_days: 30
  };
}


// ═══════════════════════════════════════════════════════════════
// MÓDULO 5: GENERACIÓN DE CARTAS DE RECLAMACIÓN
// ═══════════════════════════════════════════════════════════════

/**
 * Construir carta de reclamación formal (ES o EN)
 */
function buildClaimLetter_(caseData, language) {
  if (language === 'EN' || language === 'EN_DE' || language === 'EN_FR') {
    return buildClaimLetterEN_(caseData);
  }
  return buildClaimLetterES_(caseData);
}

/**
 * Carta en español
 */
function buildClaimLetterES_(caseData) {
  var today = Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy');
  var deadline30d = new Date();
  deadline30d.setDate(deadline30d.getDate() + 30);
  var deadline30dStr = Utilities.formatDate(deadline30d, 'Europe/Madrid', 'dd/MM/yyyy');
  
  var incidentBlock = buildIncidentBlockES_(caseData);
  
  return 'RECLAMACIÓN FORMAL DE COMPENSACIÓN — Reglamento (CE) n.º 261/2004\n\n' +
    'A la atención del Departamento de Atención al Cliente / Reclamaciones de ' + caseData.airline_name + ':\n\n' +
    'Madrid, ' + today + '\n\n' +
    '═══════════════════════════════════════════\n' +
    'I. IDENTIFICACIÓN DEL REPRESENTANTE Y PASAJERO\n' +
    '═══════════════════════════════════════════\n\n' +
    'AeroReclaim Solutions (info@aeroreclaim.com) actúa en representación de D./Dª. ' + 
    caseData.passenger_name + ', DNI/NIE ' + caseData.passenger_dni + 
    ', en virtud del mandato de representación firmado el ' + caseData.mandate_date + 
    ', adjunto como Documento 1.\n\n' +
    '═══════════════════════════════════════════\n' +
    'II. DATOS DEL VUELO AFECTADO\n' +
    '═══════════════════════════════════════════\n\n' +
    '  Compañía:        ' + caseData.airline_name + ' (' + caseData.airline_iata + ')\n' +
    '  Vuelo:           ' + caseData.flight_number + '\n' +
    '  Fecha:           ' + caseData.flight_date + '\n' +
    '  Ruta:            ' + caseData.origin_iata + ' → ' + caseData.destination_iata + '\n' +
    '  Distancia:       ~' + caseData.distance_km + ' km\n' +
    '  Código reserva:  ' + (caseData.booking_reference || 'N/A') + '\n\n' +
    '═══════════════════════════════════════════\n' +
    'III. HECHOS\n' +
    '═══════════════════════════════════════════\n\n' +
    incidentBlock + '\n\n' +
    '═══════════════════════════════════════════\n' +
    'IV. FUNDAMENTOS DE DERECHO\n' +
    '═══════════════════════════════════════════\n\n' +
    'Reglamento (CE) n.º 261/2004:\n' +
    '• Art. 5 (Cancelación) / Art. 6 (Gran retraso): obligación de compensar salvo circunstancias extraordinarias.\n' +
    '• Art. 7.1: Compensación de ' + caseData.compensation_eur + ' EUR (distancia ' + caseData.distance_km + ' km).\n' +
    '• Sentencia TJUE Sturgeon (C-402/07): retrasos >3h equiparados a cancelación.\n\n' +
    '═══════════════════════════════════════════\n' +
    'V. PETICIÓN\n' +
    '═══════════════════════════════════════════\n\n' +
    'SOLICITAMOS el abono de ' + caseData.compensation_eur + ' EUR mediante transferencia a:\n' +
    '  Titular: ' + caseData.passenger_name + '\n' +
    '  IBAN:    ' + caseData.passenger_iban + '\n\n' +
    'Plazo: 30 días naturales desde recepción (hasta el ' + deadline30dStr + ').\n\n' +
    '═══════════════════════════════════════════\n' +
    'VI. ADVERTENCIA\n' +
    '═══════════════════════════════════════════\n\n' +
    'En caso de no recibir respuesta satisfactoria en el plazo indicado, procederemos a ' +
    'interponer reclamación ante AESA (resolución vinculante desde 02/06/2023, ' +
    'plazo 90-180 días) y/o acciones judiciales. Prescripción: 5 años (Art. 1964 CC).\n\n' +
    '═══════════════════════════════════════════\n' +
    'VII. DOCUMENTACIÓN ADJUNTA\n' +
    '═══════════════════════════════════════════\n\n' +
    '• Doc. 1: Mandato de representación (' + caseData.mandate_date + ')\n' +
    '• Doc. 2: DNI/pasaporte del pasajero\n' +
    '• Doc. 3: Tarjeta de embarque / confirmación de reserva\n\n' +
    'Atentamente,\n' +
    'AeroReclaim Solutions\n' +
    'info@aeroreclaim.com\n' +
    'Expediente: ' + caseData.case_id + '\n' +
    'Fecha: ' + today;
}

function buildIncidentBlockES_(caseData) {
  var type = String(caseData.incident_type).toUpperCase();
  var fn = caseData.flight_number;
  var fd = caseData.flight_date;
  var orig = caseData.origin_iata;
  var dest = caseData.destination_iata;
  var airline = caseData.airline_name;
  
  if (type === 'RETRASO') {
    return 'El vuelo ' + fn + ' del ' + fd + ' (' + orig + '→' + dest + 
      ') sufrió un retraso en la llegada de ' + caseData.delay_hours + 
      ' horas respecto al horario programado, sin que conste la concurrencia de ' +
      'circunstancias extraordinarias conforme al Art. 5.3 del Reglamento (CE) n.º 261/2004.';
  } else if (type === 'CANCELACION') {
    return 'El vuelo ' + fn + ' del ' + fd + ' (' + orig + '→' + dest + 
      ') fue cancelado por ' + airline + ' sin previo aviso con antelación suficiente ' +
      '(más de 14 días) y sin que se hayan acreditado circunstancias extraordinarias ' +
      'que exoneren de responsabilidad conforme al Art. 5.3 del Reglamento (CE) n.º 261/2004.';
  } else if (type === 'OVERBOOKING') {
    return 'El pasajero se presentó puntualmente al embarque del vuelo ' + fn + ' del ' + fd + 
      ' (' + orig + '→' + dest + ') con documentación en regla, siendo denegado el embarque ' +
      'por causas no imputables al pasajero (presumiblemente sobreventa de plazas), ' +
      'constituyendo una denegación de embarque conforme al Art. 4 del Reglamento (CE) n.º 261/2004.';
  }
  return 'Se produjo una incidencia el ' + fd + ' en el vuelo ' + fn + ' (' + orig + '→' + dest + ').';
}

/**
 * Carta en inglés
 */
function buildClaimLetterEN_(caseData) {
  var today = Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy');
  var deadline30d = new Date();
  deadline30d.setDate(deadline30d.getDate() + 30);
  var deadline30dStr = Utilities.formatDate(deadline30d, 'Europe/Madrid', 'dd/MM/yyyy');
  
  var incidentBlock = buildIncidentBlockEN_(caseData);
  
  return 'FORMAL COMPENSATION CLAIM — EC Regulation No 261/2004\n\n' +
    'To the Customer Relations / Claims Department of ' + caseData.airline_name + ':\n\n' +
    'Madrid, ' + today + '\n\n' +
    '═══════════════════════════════════════════\n' +
    'I. REPRESENTATION AND CLAIMANT\n' +
    '═══════════════════════════════════════════\n\n' +
    'AeroReclaim Solutions (info@aeroreclaim.com) is submitting this formal compensation claim ' +
    'on behalf of passenger ' + caseData.passenger_name + ' (ID/Passport No. ' + 
    caseData.passenger_dni + ') pursuant to a signed power of attorney dated ' + 
    caseData.mandate_date + ', copy enclosed as Exhibit 1.\n\n' +
    '═══════════════════════════════════════════\n' +
    'II. FLIGHT DETAILS\n' +
    '═══════════════════════════════════════════\n\n' +
    '  Airline:              ' + caseData.airline_name + ' (' + caseData.airline_iata + ')\n' +
    '  Flight number:        ' + caseData.flight_number + '\n' +
    '  Date:                 ' + caseData.flight_date + '\n' +
    '  Route:                ' + caseData.origin_iata + ' → ' + caseData.destination_iata + '\n' +
    '  Distance:             approx. ' + caseData.distance_km + ' km\n' +
    '  Booking reference:    ' + (caseData.booking_reference || 'N/A') + '\n\n' +
    '═══════════════════════════════════════════\n' +
    'III. FACTS\n' +
    '═══════════════════════════════════════════\n\n' +
    incidentBlock + '\n\n' +
    '═══════════════════════════════════════════\n' +
    'IV. LEGAL BASIS\n' +
    '═══════════════════════════════════════════\n\n' +
    'EC Regulation No 261/2004:\n' +
    '• Article 5 (Cancellation) / Article 6 (Long delay): airline must compensate unless extraordinary circumstances.\n' +
    '• Article 7.1: Compensation of EUR ' + caseData.compensation_eur + ' (distance ' + caseData.distance_km + ' km).\n' +
    '• CJEU Sturgeon ruling (C-402/07): delays >3h equivalent to cancellation.\n\n' +
    '═══════════════════════════════════════════\n' +
    'V. REQUEST\n' +
    '═══════════════════════════════════════════\n\n' +
    'We formally request payment of EUR ' + caseData.compensation_eur + ' within THIRTY (30) calendar days:\n' +
    '  Account holder:  ' + caseData.passenger_name + '\n' +
    '  IBAN:            ' + caseData.passenger_iban + '\n\n' +
    '═══════════════════════════════════════════\n' +
    'VI. NOTICE\n' +
    '═══════════════════════════════════════════\n\n' +
    'If we do not receive full payment within 30 days (by ' + deadline30dStr + '), we will escalate ' +
    'this claim to the Spanish Aviation Safety Agency (AESA) under Article 16 of EC Regulation 261/2004. ' +
    'AESA decisions are legally binding on airlines since 2 June 2023.\n\n' +
    'Yours faithfully,\n' +
    'AeroReclaim Solutions — info@aeroreclaim.com — Case Ref: ' + caseData.case_id;
}

function buildIncidentBlockEN_(caseData) {
  var type = String(caseData.incident_type).toUpperCase();
  var fn = caseData.flight_number;
  var fd = caseData.flight_date;
  var orig = caseData.origin_iata;
  var dest = caseData.destination_iata;
  var airline = caseData.airline_name;
  
  if (type === 'RETRASO') {
    return 'Flight ' + fn + ' on ' + fd + ' (' + orig + ' to ' + dest + 
      ') arrived ' + caseData.delay_hours + ' hours late at the final destination, ' +
      'without any extraordinary circumstances being demonstrated by ' + airline + 
      ' under Article 5(3) of Regulation (EC) No 261/2004.';
  } else if (type === 'CANCELACION') {
    return 'Flight ' + fn + ' on ' + fd + ' (' + orig + ' to ' + dest + 
      ') was cancelled by ' + airline + ' without adequate prior notice (less than 14 days) ' +
      'and without demonstrating extraordinary circumstances under Article 5(3) of Regulation (EC) No 261/2004.';
  } else if (type === 'OVERBOOKING') {
    return 'The passenger presented at the boarding gate on time for flight ' + fn + ' on ' + fd + 
      ' (' + orig + ' to ' + dest + ') with valid documentation, but was denied boarding ' +
      'due to reasons not attributable to the passenger (presumed overbooking), ' +
      'constituting denied boarding under Article 4 of Regulation (EC) No 261/2004.';
  }
  return 'An incident occurred on ' + fd + ' affecting flight ' + fn + ' (' + orig + ' to ' + dest + ').';
}


// ═══════════════════════════════════════════════════════════════
// MÓDULO 6: ENVÍO DE EMAILS Y ADJUNTOS
// ═══════════════════════════════════════════════════════════════

/**
 * Enviar reclamación por email a la aerolínea
 */
function sendClaimByEmail_(caseData, airlineConfig, claimLetter) {
  var subject = 'Reclamación CE 261/2004 — Vuelo ' + caseData.flight_number + ' ' +
    caseData.flight_date + ' — Pasajero: ' + caseData.passenger_name + 
    ' — Exp. ' + caseData.case_id;
  
  // Si la aerolínea prefiere inglés, usar subject en inglés
  var lang = airlineConfig.language || 'ES';
  if (lang === 'EN' || lang === 'EN_DE' || lang === 'EN_FR') {
    subject = 'Formal Claim EC 261/2004 — Flight ' + caseData.flight_number + ' ' +
      caseData.flight_date + ' — Passenger: ' + caseData.passenger_name + 
      ' — Ref. ' + caseData.case_id;
  }
  
  // Obtener adjuntos desde Drive
  var attachments = getAttachmentsForClaim_(caseData);
  
  GmailApp.sendEmail(
    airlineConfig.claim_email,
    subject,
    claimLetter,
    {
      name: 'AeroReclaim Solutions',
      attachments: attachments,
      replyTo: 'info@aeroreclaim.com'
    }
  );
  
  // Recuperar el thread ID del email recién enviado
  Utilities.sleep(3000);
  var sentThreads = GmailApp.search(
    'subject:"' + caseData.case_id + '" in:sent',
    0, 1
  );
  
  var threadId = sentThreads.length > 0 ? sentThreads[0].getId() : '';
  
  return {
    success: true,
    threadId: threadId,
    sentTo: airlineConfig.claim_email,
    sentDate: new Date()
  };
}

/**
 * Obtener adjuntos desde Google Drive
 */
function getAttachmentsForClaim_(caseData) {
  var attachments = [];
  
  try {
    // Mandato de representación
    if (caseData.mandate_drive_url) {
      var mandateFileId = extractDriveFileId_(caseData.mandate_drive_url);
      if (mandateFileId) {
        var mandateFile = DriveApp.getFileById(mandateFileId);
        attachments.push(mandateFile.getBlob().setName('mandato_representacion.pdf'));
      }
    }
    
    // Tarjeta de embarque
    if (caseData.boarding_pass_url) {
      var boardingFileId = extractDriveFileId_(caseData.boarding_pass_url);
      if (boardingFileId) {
        var boardingFile = DriveApp.getFileById(boardingFileId);
        attachments.push(boardingFile.getBlob().setName('tarjeta_embarque.pdf'));
      }
    }
  } catch (e) {
    Logger.log('Error obteniendo adjuntos: ' + e.toString());
    // Continuar sin adjuntos si hay error
  }
  
  return attachments;
}

/**
 * Extraer File ID de una URL de Google Drive
 */
function extractDriveFileId_(driveUrl) {
  if (!driveUrl) return null;
  var match = String(driveUrl).match(/[-\w]{25,}/);
  return match ? match[0] : null;
}


// ═══════════════════════════════════════════════════════════════
// MÓDULO 7: CREACIÓN DE REGISTROS EN EXTRAJUDICIAL_QUEUE
// ═══════════════════════════════════════════════════════════════

/**
 * Crear registro para caso enviado por EMAIL
 */
function createExtrajudicialRecord_(caseData, airlineConfig, gmailResult) {
  var now = new Date();
  var deadline30d = new Date();
  deadline30d.setDate(deadline30d.getDate() + 30);
  
  return [
    caseData.case_id,                          // A: case_id
    now,                                        // B: created_at
    caseData.passenger_name,                   // C: passenger_name
    caseData.passenger_email,                  // D: passenger_email
    caseData.passenger_dni,                    // E: passenger_dni
    caseData.passenger_iban,                   // F: passenger_iban
    caseData.airline_iata,                     // G: airline_iata
    airlineConfig.airline_name,                // H: airline_name
    caseData.flight_number,                    // I: flight_number
    caseData.flight_date,                      // J: flight_date
    caseData.origin_iata,                      // K: origin_iata
    caseData.destination_iata,                 // L: destination_iata
    caseData.incident_type,                    // M: incident_type
    caseData.delay_hours,                      // N: delay_hours
    caseData.distance_km,                      // O: distance_km
    caseData.compensation_eur,                 // P: compensation_eur
    caseData.booking_reference,                // Q: booking_reference
    caseData.mandate_drive_url,                // R: mandate_drive_url
    caseData.boarding_pass_url,                // S: boarding_pass_url
    airlineConfig.claim_method,                // T: claim_method
    gmailResult.sentTo,                        // U: claim_email_sent_to
    gmailResult.sentDate,                      // V: claim_sent_date
    gmailResult.threadId || '',                // W: claim_gmail_thread_id
    deadline30d,                               // X: deadline_30d
    false,                                     // Y: reminder_15d_sent
    '',                                        // Z: reminder_15d_date
    false,                                     // AA: ultimatum_25d_sent
    '',                                        // AB: ultimatum_25d_date
    '',                                        // AC: airline_response_date
    '',                                        // AD: airline_response_type
    '',                                        // AE: airline_response_amount
    '',                                        // AF: airline_response_notes
    '',                                        // AG: airline_response_gmail_id
    false,                                     // AH: negotiation_counter_sent
    '',                                        // AI: negotiation_counter_date
    '',                                        // AJ: escalation_aesa_date
    EX_CONFIG.STATUS.WAITING,                  // AK: status
    now,                                       // AL: status_updated_at
    'auto',                                    // AM: assigned_to
    '',                                        // AN: notes
    ''                                         // AO: error_log
  ];
}

/**
 * Crear registro para caso WEBFORM_MANUAL (requiere intervención humana)
 */
function createExtrajudicialRecordManual_(caseData, airlineConfig) {
  var now = new Date();
  
  return [
    caseData.case_id,                          // A: case_id
    now,                                        // B: created_at
    caseData.passenger_name,                   // C: passenger_name
    caseData.passenger_email,                  // D: passenger_email
    caseData.passenger_dni,                    // E: passenger_dni
    caseData.passenger_iban,                   // F: passenger_iban
    caseData.airline_iata,                     // G: airline_iata
    airlineConfig.airline_name,                // H: airline_name
    caseData.flight_number,                    // I: flight_number
    caseData.flight_date,                      // J: flight_date
    caseData.origin_iata,                      // K: origin_iata
    caseData.destination_iata,                 // L: destination_iata
    caseData.incident_type,                    // M: incident_type
    caseData.delay_hours,                      // N: delay_hours
    caseData.distance_km,                      // O: distance_km
    caseData.compensation_eur,                 // P: compensation_eur
    caseData.booking_reference,                // Q: booking_reference
    caseData.mandate_drive_url,                // R: mandate_drive_url
    caseData.boarding_pass_url,                // S: boarding_pass_url
    'WEBFORM_MANUAL',                          // T: claim_method
    '',                                        // U: claim_email_sent_to
    '',                                        // V: claim_sent_date
    '',                                        // W: claim_gmail_thread_id
    '',                                        // X: deadline_30d
    false,                                     // Y: reminder_15d_sent
    '',                                        // Z: reminder_15d_date
    false,                                     // AA: ultimatum_25d_sent
    '',                                        // AB: ultimatum_25d_date
    '',                                        // AC: airline_response_date
    '',                                        // AD: airline_response_type
    '',                                        // AE: airline_response_amount
    '',                                        // AF: airline_response_notes
    '',                                        // AG: airline_response_gmail_id
    false,                                     // AH: negotiation_counter_sent
    '',                                        // AI: negotiation_counter_date
    '',                                        // AJ: escalation_aesa_date
    EX_CONFIG.STATUS.MANUAL_REVIEW,            // AK: status
    now,                                       // AL: status_updated_at
    'manual',                                  // AM: assigned_to
    'URL formulario: ' + (airlineConfig.claim_form_url || 'N/A'),  // AN: notes
    ''                                         // AO: error_log
  ];
}


// ═══════════════════════════════════════════════════════════════
// MÓDULO 8: DETECCIÓN DE RESPUESTAS EN GMAIL
// ═══════════════════════════════════════════════════════════════

/**
 * Buscar respuesta de aerolínea en el hilo de Gmail (método primario)
 */
function findResponseInThread_(threadId, sentDate) {
  try {
    var thread = GmailApp.getThreadById(threadId);
    if (!thread) return null;
    
    var messages = thread.getMessages();
    
    for (var m = 0; m < messages.length; m++) {
      var msg = messages[m];
      // Solo mensajes posteriores al envío
      if (msg.getDate() <= sentDate) continue;
      // Solo mensajes recibidos (no los que enviamos nosotros)
      if (msg.getFrom().indexOf('aeroreclaim.com') >= 0) continue;
      
      return {
        id:   msg.getId(),
        date: msg.getDate(),
        from: msg.getFrom(),
        body: msg.getPlainBody() + ' ' + msg.getBody()
      };
    }
  } catch (e) {
    Logger.log('Error buscando thread: ' + e.toString());
  }
  return null;
}

/**
 * Buscar respuesta por keywords en Gmail (método fallback)
 */
function findResponseByKeyword_(caseId, flightNumber, airlineIata, sentDate) {
  var domain = EX_CONFIG.AIRLINE_DOMAINS[airlineIata] || '';
  if (!domain) return null;
  
  var dateStr = Utilities.formatDate(sentDate, 'UTC', 'yyyy/MM/dd');
  
  // Intentar buscar por número de vuelo primero
  var queries = [
    'from:' + domain + ' after:' + dateStr + ' subject:' + flightNumber,
    'from:' + domain + ' after:' + dateStr + ' subject:' + caseId
  ];
  
  for (var q = 0; q < queries.length; q++) {
    try {
      var threads = GmailApp.search(queries[q], 0, 5);
      for (var t = 0; t < threads.length; t++) {
        var messages = threads[t].getMessages();
        for (var m = 0; m < messages.length; m++) {
          var msg = messages[m];
          if (msg.getDate() > sentDate && msg.getFrom().indexOf('aeroreclaim.com') < 0) {
            return {
              id:   msg.getId(),
              date: msg.getDate(),
              from: msg.getFrom(),
              body: msg.getPlainBody()
            };
          }
        }
      }
    } catch (e) {
      Logger.log('Error búsqueda Gmail: ' + e.toString());
    }
  }
  return null;
}


// ═══════════════════════════════════════════════════════════════
// MÓDULO 9: CLASIFICACIÓN DE RESPUESTAS DE AEROLÍNEAS
// ═══════════════════════════════════════════════════════════════

/**
 * Clasificar respuesta de aerolínea por keywords
 */
function classifyAirlineResponse_(emailBody) {
  var text = String(emailBody).toLowerCase();
  
  var ACCEPTANCE = ['aceptamos', 'aprobamos', 'procederemos al abono', 'confirmar el pago',
    'we accept', 'approved', 'compensation approved', 'will process payment',
    'abono de compensación', 'pago de la compensación', 'accedemos a',
    'reconocemos el derecho', 'resolución favorable', 'se ha aprobado'];
  
  var REJECTION = ['rechazamos', 'denegamos', 'no ha lugar', 'desestimamos', 'no procede',
    'circunstancias extraordinarias', 'fuerza mayor', 'extraordinary circumstances',
    'cannot accept', 'unable to process', 'no compensation is due', 'regret to inform',
    'exoneración de responsabilidad', 'no resulta de aplicación del reglamento'];
  
  var PARTIAL_OFFER = ['ofrecemos', 'proponemos', 'bono de viaje', 'voucher', 'vale de viaje',
    'importe inferior', 'we offer', 'as a gesture of goodwill', 'travel credit',
    'compensación alternativa', 'en su lugar', 'importe de'];
  
  var acceptScore = 0;
  var rejectScore = 0;
  var partialScore = 0;
  
  for (var a = 0; a < ACCEPTANCE.length; a++) {
    if (text.indexOf(ACCEPTANCE[a]) >= 0) acceptScore++;
  }
  for (var r = 0; r < REJECTION.length; r++) {
    if (text.indexOf(REJECTION[r]) >= 0) rejectScore++;
  }
  for (var p = 0; p < PARTIAL_OFFER.length; p++) {
    if (text.indexOf(PARTIAL_OFFER[p]) >= 0) partialScore++;
  }
  
  if (acceptScore >= 2 && rejectScore === 0) {
    return { type: 'ACEPTACION_TOTAL', notes: 'Keywords aceptación: ' + acceptScore };
  }
  if (partialScore >= 1 && rejectScore === 0) {
    return { type: 'OFERTA_PARCIAL', notes: 'Keywords oferta parcial: ' + partialScore };
  }
  if (rejectScore >= 1) {
    return { type: 'RECHAZO', notes: 'Keywords rechazo: ' + rejectScore };
  }
  if (acceptScore === 1) {
    return { type: 'ACEPTACION_TOTAL', notes: 'Clasificación con 1 keyword' };
  }
  
  return { type: 'PENDIENTE_REVISION', notes: 'No clasificado automáticamente' };
}

/**
 * Extraer importe ofrecido del email
 */
function extractOfferedAmount_(emailBody) {
  var patterns = [
    /(\d+(?:[.,]\d{2})?)\s*(?:EUR|€|euros?)/gi,
    /(?:EUR|€|euros?)\s*(\d+(?:[.,]\d{2})?)/gi,
    /compensaci[oó]n\s+de\s+(\d+)/gi,
    /importe\s+de\s+(\d+)/gi
  ];
  
  for (var p = 0; p < patterns.length; p++) {
    var match = patterns[p].exec(emailBody);
    if (match) {
      var amount = parseFloat(match[1].replace(',', '.'));
      if (amount >= 100 && amount <= 1000) return amount; // Rango razonable CE 261
    }
  }
  return null;
}


// ═══════════════════════════════════════════════════════════════
// MÓDULO 10: EMAILS DE RECORDATORIO Y ULTIMÁTUM
// ═══════════════════════════════════════════════════════════════

/**
 * Enviar recordatorio D+15 a la aerolínea
 */
function sendReminderEmail_(row, cols) {
  var airlineEmail = row[cols.claimEmailSentTo];
  if (!airlineEmail) return;
  
  var airlineName = row[cols.airlineName];
  var caseId = row[cols.caseId];
  var flightNumber = row[cols.flightNumber];
  var flightDate = row[cols.flightDate];
  var passengerName = row[cols.passengerName];
  var claimSentDate = Utilities.formatDate(
    new Date(row[cols.sentDate]), 'Europe/Madrid', 'dd/MM/yyyy'
  );
  var deadline30d = Utilities.formatDate(
    new Date(row[cols.deadline30d]), 'Europe/Madrid', 'dd/MM/yyyy'
  );
  
  var subject = 'RECORDATORIO — Reclamación CE 261/2004 pendiente — Vuelo ' + 
    flightNumber + ' — Exp. ' + caseId;
  
  var body = 'Estimado Departamento de Reclamaciones de ' + airlineName + ',\n\n' +
    'En relación con nuestra reclamación formal enviada el ' + claimSentDate + 
    ' (Exp. ' + caseId + '), relativa al vuelo ' + flightNumber + 
    ' con fecha ' + flightDate + ' del pasajero ' + passengerName + ',\n\n' +
    'RECORDAMOS que han transcurrido 15 días desde el envío de dicha reclamación ' +
    'sin haber recibido respuesta.\n\n' +
    'Conforme a la normativa vigente, disponen de un plazo máximo de 30 días ' +
    'desde la recepción, que vence el ' + deadline30d + '.\n\n' +
    'Les rogamos atiendan la reclamación a la mayor brevedad.\n\n' +
    'Atentamente,\n' +
    'AeroReclaim Solutions — info@aeroreclaim.com — Exp. ' + caseId;
  
  GmailApp.sendEmail(airlineEmail, subject, body, {
    name: 'AeroReclaim Solutions',
    replyTo: 'info@aeroreclaim.com'
  });
}

/**
 * Enviar ultimátum D+25 a la aerolínea
 */
function sendUltimatumEmail_(row, cols) {
  var airlineEmail = row[cols.claimEmailSentTo];
  if (!airlineEmail) return;
  
  var airlineName = row[cols.airlineName];
  var caseId = row[cols.caseId];
  var flightNumber = row[cols.flightNumber];
  var flightDate = row[cols.flightDate];
  var compensation = row[cols.compensationEur];
  var incidentType = row[cols.incidentType];
  var passengerName = row[cols.passengerName];
  var deadline30d = Utilities.formatDate(
    new Date(row[cols.deadline30d]), 'Europe/Madrid', 'dd/MM/yyyy'
  );
  
  var subject = 'REQUERIMIENTO FINAL — CE 261/2004 — 5 días para respuesta — Vuelo ' + 
    flightNumber + ' — Exp. ' + caseId;
  
  var body = 'Estimado Departamento de Reclamaciones de ' + airlineName + ',\n\n' +
    'En relación con nuestra reclamación formal y el recordatorio enviados para el vuelo ' + 
    flightNumber + ' del ' + flightDate + ' del pasajero ' + passengerName + 
    ' (Exp. ' + caseId + '):\n\n' +
    'ADVERTIMOS que el plazo de 30 días vence el ' + deadline30d + ' (en 5 días).\n\n' +
    'Sin respuesta satisfactoria en ese plazo, procederemos INMEDIATAMENTE a:\n' +
    '  ▶ Interponer reclamación ante AESA (resolución vinculante, 90-180 días)\n' +
    '  ▶ Iniciar acciones judiciales si fuera necesario\n\n' +
    'Importe reclamado: ' + compensation + ' EUR (' + incidentType + ', vuelo ' + 
    flightNumber + ', ' + flightDate + ').\n\n' +
    'Para evitar la escalada, contactar antes del ' + deadline30d + 
    ' a info@aeroreclaim.com con referencia Exp. ' + caseId + '.\n\n' +
    'Atentamente,\n' +
    'AeroReclaim Solutions — info@aeroreclaim.com — Exp. ' + caseId;
  
  GmailApp.sendEmail(airlineEmail, subject, body, {
    name: 'AeroReclaim Solutions',
    replyTo: 'info@aeroreclaim.com'
  });
}


// ═══════════════════════════════════════════════════════════════
// MÓDULO 11: NOTIFICACIONES AL PASAJERO
// ═══════════════════════════════════════════════════════════════

/**
 * Notificar al pasajero que se ha enviado la reclamación
 */
function sendPassengerClaimSentNotification_(caseData, airlineConfig) {
  var deadline30d = new Date();
  deadline30d.setDate(deadline30d.getDate() + 30);
  var deadline30dStr = Utilities.formatDate(deadline30d, 'Europe/Madrid', 'dd/MM/yyyy');
  var todayStr = Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy');
  var reminder15d = new Date();
  reminder15d.setDate(reminder15d.getDate() + 15);
  var reminder15dStr = Utilities.formatDate(reminder15d, 'Europe/Madrid', 'dd/MM/yyyy');
  var ultimatum25d = new Date();
  ultimatum25d.setDate(ultimatum25d.getDate() + 25);
  var ultimatum25dStr = Utilities.formatDate(ultimatum25d, 'Europe/Madrid', 'dd/MM/yyyy');
  
  var incidentLabel = {
    'RETRASO': 'retraso', 'CANCELACION': 'cancelación', 'OVERBOOKING': 'denegación de embarque'
  };
  var label = incidentLabel[String(caseData.incident_type).toUpperCase()] || caseData.incident_type;
  
  var htmlBody = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0"></head>' +
    '<body style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Arial, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px; color: #333;">' +
    '<div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">' +
    
    // Header
    '<div style="background: linear-gradient(135deg, #1a3c6e 0%, #2563eb 100%); padding: 32px 40px; text-align: center;">' +
    '<h1 style="color: #ffffff; font-size: 22px; margin: 0 0 6px 0; font-weight: 700;">✈ AeroReclaim</h1>' +
    '<p style="color: #bfdbfe; font-size: 13px; margin: 0;">Gestión profesional de reclamaciones aéreas</p>' +
    '<div style="display: inline-block; background: #10b981; color: white; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 12px;">✓ Reclamación Enviada</div>' +
    '</div>' +
    
    // Body
    '<div style="padding: 36px 40px;">' +
    '<p style="font-size: 18px; font-weight: 600; color: #1e293b; margin-bottom: 8px;">Hola, ' + caseData.passenger_name + '</p>' +
    '<p style="color: #475569; font-size: 14px; line-height: 1.7; margin-bottom: 24px;">' +
    'Te confirmamos que hemos enviado hoy la reclamación formal a <strong>' + caseData.airline_name + 
    '</strong> en tu nombre, al amparo del <strong>Reglamento (CE) nº 261/2004</strong>. Todo está en marcha.</p>' +
    
    // Amount
    '<div style="font-size: 28px; font-weight: 800; color: #1a3c6e; text-align: center; padding: 20px;">' +
    caseData.compensation_eur + ' €<br>' +
    '<span style="font-size: 13px; color: #64748b; font-weight: 400;">Compensación reclamada por ' + label + '</span></div>' +
    
    // Flight info card
    '<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px 24px; margin-bottom: 20px;">' +
    '<h3 style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.8px; color: #94a3b8; margin: 0 0 14px 0; font-weight: 600;">Datos del vuelo reclamado</h3>' +
    '<table style="width: 100%; border-collapse: collapse;">' +
    '<tr style="border-bottom: 1px solid #e2e8f0;"><td style="color: #64748b; padding: 7px 0;">Aerolínea</td><td style="color: #1e293b; font-weight: 600; text-align: right; padding: 7px 0;">' + caseData.airline_name + '</td></tr>' +
    '<tr style="border-bottom: 1px solid #e2e8f0;"><td style="color: #64748b; padding: 7px 0;">Vuelo</td><td style="color: #1e293b; font-weight: 600; text-align: right; padding: 7px 0;">' + caseData.flight_number + ' · ' + caseData.flight_date + '</td></tr>' +
    '<tr style="border-bottom: 1px solid #e2e8f0;"><td style="color: #64748b; padding: 7px 0;">Ruta</td><td style="color: #1e293b; font-weight: 600; text-align: right; padding: 7px 0;">' + caseData.origin_iata + ' → ' + caseData.destination_iata + '</td></tr>' +
    '<tr style="border-bottom: 1px solid #e2e8f0;"><td style="color: #64748b; padding: 7px 0;">Fecha envío</td><td style="color: #1e293b; font-weight: 600; text-align: right; padding: 7px 0;">' + todayStr + '</td></tr>' +
    '<tr><td style="color: #64748b; padding: 7px 0;">Plazo respuesta</td><td style="color: #1e293b; font-weight: 600; text-align: right; padding: 7px 0;">' + deadline30dStr + '</td></tr>' +
    '</table></div>' +
    
    // Case ID badge
    '<div style="text-align: center; margin: 28px 0;">' +
    '<p style="font-size: 13px; color: #64748b; margin-bottom: 10px;">Tu número de expediente</p>' +
    '<div style="display: inline-block; background: #1a3c6e; color: white; font-family: Courier New, monospace; font-size: 16px; padding: 8px 20px; border-radius: 6px; letter-spacing: 1px;">' + caseData.case_id + '</div></div>' +
    
    // Info box
    '<div style="background: #eff6ff; border-left: 4px solid #2563eb; padding: 14px 18px; border-radius: 0 6px 6px 0; font-size: 13px; color: #1e40af; line-height: 1.6; margin: 20px 0;">' +
    '<strong>¿Tienes que hacer algo?</strong> No. Nosotros llevamos todo el proceso. ' +
    'Te notificaremos en cuanto recibamos respuesta de ' + caseData.airline_name + '. ' +
    'Si la aerolínea no responde antes del ' + deadline30dStr + ', escalamos automáticamente a AESA.</div>' +
    
    '</div>' +
    
    // Footer
    '<div style="background: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #e2e8f0;">' +
    '<p style="font-size: 12px; color: #94a3b8; margin: 4px 0;"><strong>AeroReclaim Solutions</strong></p>' +
    '<p style="font-size: 12px; color: #94a3b8; margin: 4px 0;"><a href="mailto:info@aeroreclaim.com" style="color: #2563eb; text-decoration: none;">info@aeroreclaim.com</a></p>' +
    '<p style="font-size: 12px; color: #94a3b8; margin: 4px 0;">Este es un mensaje automático. Responde a este correo si tienes alguna pregunta.</p>' +
    '<p style="margin-top: 12px; font-size: 11px; color: #cbd5e1;">Expediente ' + caseData.case_id + ' · Enviado el ' + todayStr + '</p>' +
    '</div></div></body></html>';
  
  var subject = 'AeroReclaim — Tu reclamación de ' + caseData.compensation_eur + 
    '€ ha sido enviada a ' + caseData.airline_name + ' — Exp. ' + caseData.case_id;
  
  GmailApp.sendEmail(caseData.passenger_email, subject, 
    'Hola ' + caseData.passenger_name + ', te confirmamos que hemos enviado tu reclamación a ' + 
    caseData.airline_name + '. Expediente: ' + caseData.case_id + '. Importe: ' + 
    caseData.compensation_eur + '€. Plazo respuesta: ' + deadline30dStr + '.',
    {
      name: 'AeroReclaim Solutions',
      htmlBody: htmlBody,
      replyTo: 'info@aeroreclaim.com'
    }
  );
}

/**
 * Notificar al pasajero que la aerolínea aceptó
 */
function notifyPassengerAcceptance_(row, cols, amount) {
  var to = row[cols.passengerEmail];
  var name = row[cols.passengerName];
  var caseId = row[cols.caseId];
  
  GmailApp.sendEmail(to,
    '¡Buenas noticias! Tu reclamación ha sido aceptada — Exp. ' + caseId,
    'Hola ' + name + ',\n\n' +
    '¡Excelente noticia! La aerolínea ha aceptado tu reclamación.\n\n' +
    'Importe acordado: ' + amount + ' EUR\n\n' +
    'Nos pondremos en contacto contigo para coordinar el cobro.\n\n' +
    'Ref. Expediente: ' + caseId + '\n\nAtentamente,\nAeroReclaim Solutions',
    { name: 'AeroReclaim Solutions', replyTo: 'info@aeroreclaim.com' }
  );
}

/**
 * Notificar al pasajero que la aerolínea rechazó
 */
function notifyPassengerRejection_(row, cols) {
  var to = row[cols.passengerEmail];
  var name = row[cols.passengerName];
  var caseId = row[cols.caseId];
  
  GmailApp.sendEmail(to,
    'Actualización sobre tu reclamación — Exp. ' + caseId,
    'Hola ' + name + ',\n\n' +
    'La aerolínea ha rechazado tu reclamación. No te preocupes: ' +
    'vamos a escalar el caso ante AESA, cuya resolución es VINCULANTE para ' +
    'la aerolínea desde junio de 2023.\n\n' +
    'Seguimos trabajando en tu caso. Te mantendremos informado/a.\n\n' +
    'Ref. Expediente: ' + caseId + '\n\nAtentamente,\nAeroReclaim Solutions',
    { name: 'AeroReclaim Solutions', replyTo: 'info@aeroreclaim.com' }
  );
}

/**
 * Notificar al pasajero que el caso se escaló a AESA
 */
function notifyPassengerEscalation_(row, cols) {
  var to = row[cols.passengerEmail];
  var name = row[cols.passengerName];
  var caseId = row[cols.caseId];
  
  GmailApp.sendEmail(to,
    'Tu caso ha sido escalado a AESA — Exp. ' + caseId,
    'Hola ' + name + ',\n\n' +
    'La aerolínea no ha respondido en el plazo legal de 30 días.\n\n' +
    'Hemos escalado tu caso ante la AGENCIA ESTATAL DE SEGURIDAD AÉREA (AESA).\n\n' +
    'AESA tiene poder de resolución VINCULANTE para las aerolíneas. ' +
    'El plazo de resolución es de 90-180 días.\n\n' +
    'Te informaremos de cada novedad.\n\n' +
    'Ref. Expediente: ' + caseId + '\n\nAtentamente,\nAeroReclaim Solutions',
    { name: 'AeroReclaim Solutions', replyTo: 'info@aeroreclaim.com' }
  );
}


// ═══════════════════════════════════════════════════════════════
// MÓDULO 12: UTILIDADES Y HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Buscar índice de columna por nombre (case-insensitive)
 */
function findCol_(headers, colName) {
  var target = String(colName).toLowerCase();
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).toLowerCase() === target) return i;
  }
  return -1;
}

/**
 * Verificar si un caso ya existe en Extrajudicial_Queue
 */
function caseExistsInExtrajudicial_(sheet, caseId) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === caseId) return true;
  }
  return false;
}

/**
 * Actualizar datos de respuesta en la hoja
 */
function updateResponseInSheet_(sheet, rowNum, headers, responseDate, 
    responseType, responseAmount, notes, gmailId) {
  var updates = {
    'airline_response_date':     responseDate,
    'airline_response_type':     responseType,
    'airline_response_amount':   responseAmount || '',
    'airline_response_notes':    notes,
    'airline_response_gmail_id': gmailId
  };
  
  var keys = Object.keys(updates);
  for (var k = 0; k < keys.length; k++) {
    var colIdx = findCol_(headers, keys[k]);
    if (colIdx >= 0) {
      sheet.getRange(rowNum, colIdx + 1).setValue(updates[keys[k]]);
    }
  }
}

/**
 * Registrar acción en Agent4_Log
 */
function logAction_(ss, caseId, action, details) {
  try {
    var logSheet = ss.getSheetByName(EX_CONFIG.SHEETS.LOG);
    if (!logSheet) return;
    
    logSheet.appendRow([
      new Date(),          // A: timestamp
      caseId,              // B: case_id
      action,              // C: action
      details,             // D: details
      'Agent4_Auto'        // E: user
    ]);
  } catch (e) {
    Logger.log('Error logging: ' + e.toString());
  }
}

/**
 * Enviar alerta interna a info@aeroreclaim.com y ptusquets@gmail.com
 */
function sendInternalAlert_(caseId, message) {
  try {
    GmailApp.sendEmail(
      EX_CONFIG.AERORECLAIM_EMAIL + ',' + EX_CONFIG.NOTIFICATION_EMAIL,
      '[AeroReclaim Agent 4] Alerta — Exp. ' + caseId,
      'Expediente: ' + caseId + '\n\n' + message + '\n\n' +
      'Generado automáticamente por Agent 4 — ' + new Date().toISOString(),
      { name: 'AeroReclaim Agent 4 (Sistema)' }
    );
  } catch (e) {
    Logger.log('Error enviando alerta: ' + e.toString());
  }
}


// ═══════════════════════════════════════════════════════════════
// MÓDULO 13: TRIGGERS (INSTALAR MANUALMENTE)
// ═══════════════════════════════════════════════════════════════

/**
 * Instalar triggers del Agent 4 SOLAMENTE.
 * NO borra triggers de otros agentes (Agent 2, Agent 3).
 * Ejecutar UNA VEZ manualmente.
 */
function installExtrajudicialTriggers() {
  // Primero borrar SOLO triggers de funciones del Agent 4 (si existen)
  var triggers = ScriptApp.getProjectTriggers();
  var agent4Functions = [
    'processNewExtrajudicialCases',
    'processAirlineResponses', 
    'processDeadlines'
  ];
  
  for (var i = 0; i < triggers.length; i++) {
    var funcName = triggers[i].getHandlerFunction();
    if (agent4Functions.indexOf(funcName) >= 0) {
      ScriptApp.deleteTrigger(triggers[i]);
      Logger.log('Trigger eliminado: ' + funcName);
    }
  }
  
  // TRIGGER 1: Nuevos casos — cada 5 minutos
  ScriptApp.newTrigger('processNewExtrajudicialCases')
    .timeBased()
    .everyMinutes(5)
    .create();
  
  // TRIGGER 2: Respuestas aerolíneas — cada 15 minutos
  ScriptApp.newTrigger('processAirlineResponses')
    .timeBased()
    .everyMinutes(15)
    .create();
  
  // TRIGGER 3: Plazos — diario a las 10:00 Madrid
  ScriptApp.newTrigger('processDeadlines')
    .timeBased()
    .everyDays(1)
    .atHour(10)
    .inTimezone('Europe/Madrid')
    .create();
  
  Logger.log('✓ 3 triggers de Agent 4 (Extrajudicial) instalados correctamente');
  
  // Verificar total de triggers
  var allTriggers = ScriptApp.getProjectTriggers();
  Logger.log('Total de triggers en el proyecto: ' + allTriggers.length);
  for (var j = 0; j < allTriggers.length; j++) {
    Logger.log('  - ' + allTriggers[j].getHandlerFunction());
  }
}


// ═══════════════════════════════════════════════════════════════
// MÓDULO 14: FUNCIONES DE TEST
// ═══════════════════════════════════════════════════════════════

/**
 * Test: Verificar lectura de datos y configuración
 */
function testExtrajudicialConfig() {
  var ss = SpreadsheetApp.openById(EX_CONFIG.SPREADSHEET_ID);
  
  // Verificar pestañas
  var tabs = ['Extrajudicial_Queue', 'Airline_Database', 'Agent4_Log', 'Onboarding_Queue'];
  for (var t = 0; t < tabs.length; t++) {
    var sheet = ss.getSheetByName(tabs[t]);
    Logger.log(tabs[t] + ': ' + (sheet ? '✓ encontrada (' + sheet.getLastRow() + ' filas)' : '✗ NO ENCONTRADA'));
  }
  
  // Verificar Airline_Database
  var airlineDb = ss.getSheetByName('Airline_Database');
  if (airlineDb) {
    var airlines = airlineDb.getDataRange().getValues();
    Logger.log('Aerolíneas en DB: ' + (airlines.length - 1));
    for (var a = 1; a < airlines.length; a++) {
      Logger.log('  ' + airlines[a][0] + ' | ' + airlines[a][1] + ' | ' + airlines[a][2]);
    }
  }
  
  // Verificar si hay casos LISTO_EXTRAJUDICIAL
  var onboarding = ss.getSheetByName('Onboarding_Queue');
  if (onboarding) {
    var data = onboarding.getDataRange().getValues();
    var headers = data[0];
    var statusCol = findCol_(headers, 'status');
    var readyCount = 0;
    for (var i = 1; i < data.length; i++) {
      if (data[i][statusCol] === 'LISTO_EXTRAJUDICIAL') readyCount++;
    }
    Logger.log('Casos LISTO_EXTRAJUDICIAL: ' + readyCount);
  }
  
  Logger.log('\n✓ Test de configuración completado');
}

/**
 * Test: Enviar carta de prueba a nuestro propio buzón (NO a aerolínea)
 */
function testSendClaimToSelf() {
  var testCase = {
    case_id: 'AR-TEST-EXT-001',
    passenger_name: 'Test Pasajero',
    passenger_email: 'info@aeroreclaim.com',
    passenger_dni: '12345678A',
    passenger_iban: 'ES91 2100 0418 4502 0005 1332',
    passenger_phone: '+34600000000',
    airline_iata: 'VY',
    airline_name: 'Vueling Airlines',
    flight_number: 'VY7821',
    flight_date: '15/02/2026',
    origin_iata: 'BCN',
    destination_iata: 'MAD',
    incident_type: 'RETRASO',
    delay_hours: 4.5,
    distance_km: 620,
    compensation_eur: 250,
    booking_reference: 'TEST123',
    mandate_date: '06/03/2026',
    mandate_drive_url: '',
    boarding_pass_url: '',
    legal_score: 85
  };
  
  // Generar carta ES
  var letterES = buildClaimLetterES_(testCase);
  Logger.log('=== CARTA ES ===');
  Logger.log(letterES.substring(0, 500) + '...');
  
  // Generar carta EN
  var letterEN = buildClaimLetterEN_(testCase);
  Logger.log('\n=== CARTA EN ===');
  Logger.log(letterEN.substring(0, 500) + '...');
  
  // Enviar carta de prueba a nuestro buzón
  GmailApp.sendEmail(
    'info@aeroreclaim.com',
    '[TEST] Reclamación CE 261/2004 — VY7821 — AR-TEST-EXT-001',
    letterES,
    { name: 'AeroReclaim Solutions (TEST)' }
  );
  
  Logger.log('\n✓ Carta de test enviada a info@aeroreclaim.com');
  Logger.log('Revisar buzón para verificar formato.');
}
