/**
 * ═══════════════════════════════════════════════════════════════
 * AERORECLAIM — AGENTE 6: COBRO / COLLECTION
 * Versión 1.0 | Marzo 2026
 *
 * Gestiona el proceso completo de cobro de compensaciones:
 *   1. Detecta casos COBRO_PENDIENTE/ACEPTADA en Agents 4 y 5
 *   2. Envía instrucciones de cobro al pasajero
 *   3. Monitoriza confirmaciones de pago por email
 *   4. Genera y envía factura de comisión (25% + IVA)
 *   5. Gestiona plazos y recordatorios automáticos
 *   6. Cierra casos exitosamente o escala internamente
 *
 * TRIGGERS (instalar con installCollectionTriggers()):
 *   - processNewCollectionCases:    cada 5 min
 *   - processCollectionFollowups:   cada 15 min
 *   - processCollectionDeadlines:   diario a las 10:00
 *
 * COSTE: 0€/mes — todo sobre Google Workspace existente
 * ═══════════════════════════════════════════════════════════════
 */

// ─── CONFIGURACIÓN ─────────────────────────────────────────────
var COL_CONFIG = {
  SPREADSHEET_ID: '10zEyvd3P57DidwOi2UM1VnXHDnPrIWMnpTSbdZ4zX-E',
  SHEETS: {
    EXTRAJUDICIAL_QUEUE: 'Extrajudicial_Queue',
    AESA_QUEUE:          'AESA_Queue',
    COLLECTION_QUEUE:    'Collection_Queue',
    LOG:                 'Agent6_Log'
  },
  AERORECLAIM_EMAIL:  'info@aeroreclaim.com',
  AERORECLAIM_NAME:   'AeroReclaim Solutions',
  NOTIFICATION_EMAIL: 'ptusquets@gmail.com',

  // Comisión
  COMMISSION_RATE: 0.25,     // 25%
  IVA_RATE:        0.21,     // 21% IVA
  // Total multiplier: 0.25 * 1.21 = 0.3025

  // Datos bancarios (configurar cuando se tenga cuenta de empresa)
  BANK_IBAN:    'ES00 0000 0000 0000 0000 0000',
  BANK_HOLDER:  'AeroReclaim Solutions',
  BANK_BIZUM:   '+34 600 000 000',

  // Plazos en días
  DEADLINES: {
    PAYMENT_WAIT:              30,   // días que tiene la aerolínea para pagar
    REMINDER_1_DAYS:           15,   // primer recordatorio al pasajero
    REMINDER_2_DAYS:           30,   // segundo recordatorio (urgente)
    ESCALATE_DAYS:             45,   // escalar internamente
    COMMISSION_REMINDER_1:     15,   // primer recordatorio factura comisión
    COMMISSION_REMINDER_2:     30    // segundo recordatorio factura comisión
  },

  // Status values
  STATUS: {
    // Source statuses (Agent 4)
    EX_ACCEPTED:        'ACEPTADA',
    EX_COBRO_PENDING:   'COBRO_PENDIENTE',
    EX_PROCESSED_COBRO: 'PROCESADO_COBRO',
    // Source statuses (Agent 5)
    AESA_COBRO_PENDING: 'COBRO_PENDIENTE',
    AESA_PROCESSED_COBRO: 'PROCESADO_COBRO',
    // Collection_Queue statuses
    PENDING:                'PENDIENTE_COBRO',
    INSTRUCTIONS_SENT:      'INSTRUCCIONES_ENVIADAS',
    REMINDER_SENT:          'RECORDATORIO_ENVIADO',
    REMINDER_2_SENT:        'RECORDATORIO_2_ENVIADO',
    PAYMENT_CONFIRMED:      'PAGO_CONFIRMADO',
    INVOICE_SENT:           'FACTURA_ENVIADA',
    COMMISSION_COLLECTED:   'COMISION_COBRADA',
    CLOSED_SUCCESS:         'CERRADO_EXITOSO',
    ESCALATED:              'ESCALADA_INTERNA',
    CLOSED_NO_COLLECTION:   'CERRADO_SIN_COBRO',
    MANUAL_REVIEW:          'REQUIERE_REVISION_MANUAL',
    ERROR:                  'ERROR'
  },

  // Keywords para detectar confirmación de pago
  PAYMENT_CONFIRM_KEYWORDS: [
    'recibido', 'cobrado', 'pagado', 'transferencia recibida',
    'ingreso recibido', 'ya me han pagado', 'he recibido el pago',
    'confirmado el pago', 'ha llegado', 'me han ingresado',
    'received', 'payment received', 'got the money'
  ],
  PAYMENT_PROBLEM_KEYWORDS: [
    'no he recibido', 'no me han pagado', 'problema', 'duda',
    'cuándo', 'cuando cobro', 'sin pagar', 'nada todavía',
    'haven\'t received', 'not paid'
  ],
  COMMISSION_CONFIRM_KEYWORDS: [
    'pagada la comisión', 'transferencia realizada', 'he pagado',
    'comisión pagada', 'enviado bizum', 'bizum enviado',
    'transferido', 'ya os he pagado', 'pagué la comisión'
  ]
};


// ═══════════════════════════════════════════════════════════════
// FUNCIONES HELPER (privadas, sufijo Collection_)
// ═══════════════════════════════════════════════════════════════

/**
 * Buscar índice de columna por header en Collection_Queue
 */
function findColCollection_(sheet, headerName) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (headers[i] === headerName) return i + 1; // 1-based
  }
  return -1;
}

/**
 * Registrar acción en Agent6_Log
 */
function logActionCollection_(ss, caseId, action, details) {
  try {
    var logSheet = ss.getSheetByName(COL_CONFIG.SHEETS.LOG);
    if (!logSheet) return;
    logSheet.appendRow([
      new Date(),
      caseId || 'SYSTEM',
      action,
      details,
      'Agent6'
    ]);
  } catch (e) {
    Logger.log('Error logging: ' + e.message);
  }
}

/**
 * Enviar email HTML desde info@aeroreclaim.com
 */
function sendEmailCollection_(to, subject, htmlBody, caseId) {
  try {
    GmailApp.sendEmail(to, subject, '', {
      htmlBody: htmlBody,
      name: COL_CONFIG.AERORECLAIM_NAME,
      replyTo: COL_CONFIG.AERORECLAIM_EMAIL
    });
    return true;
  } catch (e) {
    Logger.log('Error sending email to ' + to + ': ' + e.message);
    return false;
  }
}

/**
 * Enviar notificación interna
 */
function notifyInternalCollection_(subject, body) {
  try {
    GmailApp.sendEmail(COL_CONFIG.NOTIFICATION_EMAIL, subject, '', {
      htmlBody: body,
      name: COL_CONFIG.AERORECLAIM_NAME,
      replyTo: COL_CONFIG.AERORECLAIM_EMAIL
    });
    // También enviar a info@
    GmailApp.sendEmail(COL_CONFIG.AERORECLAIM_EMAIL, subject, '', {
      htmlBody: body,
      name: 'Agent 6 - Collection',
      noReply: true
    });
  } catch (e) {
    Logger.log('Error notifying internal: ' + e.message);
  }
}

/**
 * Calcular comisión AeroReclaim (25% + IVA)
 */
function calculateCommission_(compensationEur) {
  var base = compensationEur * COL_CONFIG.COMMISSION_RATE;
  var iva = base * COL_CONFIG.IVA_RATE;
  var total = base + iva;
  return {
    base: Math.round(base * 100) / 100,
    iva: Math.round(iva * 100) / 100,
    total: Math.round(total * 100) / 100
  };
}

/**
 * Formatear fecha a dd/mm/yyyy
 */
function formatDateCollection_(date) {
  if (!date || !(date instanceof Date)) return '';
  var d = date.getDate().toString().padStart(2, '0');
  var m = (date.getMonth() + 1).toString().padStart(2, '0');
  var y = date.getFullYear();
  return d + '/' + m + '/' + y;
}

/**
 * Calcular días entre dos fechas
 */
function daysBetweenCollection_(date1, date2) {
  var oneDay = 24 * 60 * 60 * 1000;
  return Math.round(Math.abs((date2 - date1) / oneDay));
}

/**
 * Añadir días a una fecha
 */
function addDaysCollection_(date, days) {
  var result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}


// ═══════════════════════════════════════════════════════════════
// MÓDULO 1: NUEVOS CASOS (trigger cada 5 min)
// ═══════════════════════════════════════════════════════════════

function processNewCollectionCases() {
  var ss = SpreadsheetApp.openById(COL_CONFIG.SPREADSHEET_ID);
  var colSheet = ss.getSheetByName(COL_CONFIG.SHEETS.COLLECTION_QUEUE);

  if (!colSheet) {
    logActionCollection_(ss, 'SYSTEM', 'ERROR', 'Collection_Queue no encontrada');
    return;
  }

  var casesAdded = 0;

  // ─── Fase 1: Escanear Agent 4 (Extrajudicial_Queue) ───
  try {
    casesAdded += scanExtrajudicialForCollection_(ss, colSheet);
  } catch (e) {
    logActionCollection_(ss, 'SYSTEM', 'ERROR', 'Error escaneando Extrajudicial: ' + e.message);
  }

  // ─── Fase 2: Escanear Agent 5 (AESA_Queue) ───
  try {
    casesAdded += scanAESAForCollection_(ss, colSheet);
  } catch (e) {
    logActionCollection_(ss, 'SYSTEM', 'ERROR', 'Error escaneando AESA: ' + e.message);
  }

  // ─── Fase 3: Procesar nuevos casos PENDIENTE_COBRO ───
  try {
    processNewPendingCases_(ss, colSheet);
  } catch (e) {
    logActionCollection_(ss, 'SYSTEM', 'ERROR', 'Error procesando pendientes: ' + e.message);
  }

  if (casesAdded > 0) {
    logActionCollection_(ss, 'SYSTEM', 'SCAN_COMPLETE', casesAdded + ' nuevos casos añadidos a Collection_Queue');
  }
}

/**
 * Escanear Extrajudicial_Queue para casos ACEPTADA/COBRO_PENDIENTE
 */
function scanExtrajudicialForCollection_(ss, colSheet) {
  var exSheet = ss.getSheetByName(COL_CONFIG.SHEETS.EXTRAJUDICIAL_QUEUE);
  if (!exSheet || exSheet.getLastRow() < 2) return 0;

  var exData = exSheet.getDataRange().getValues();
  var exHeaders = exData[0];

  // Buscar columnas en Extrajudicial_Queue
  var exColIdx = {};
  var neededCols = ['case_id', 'passenger_name', 'passenger_email', 'passenger_phone',
                    'airline_name', 'flight_number', 'flight_date', 'incident_type',
                    'compensation_eur', 'status', 'claim_sent_date'];
  for (var h = 0; h < exHeaders.length; h++) {
    if (neededCols.indexOf(exHeaders[h]) >= 0) {
      exColIdx[exHeaders[h]] = h;
    }
  }

  // Check si tenemos las columnas necesarias
  if (exColIdx['case_id'] === undefined || exColIdx['status'] === undefined) {
    logActionCollection_(ss, 'SYSTEM', 'WARNING', 'Extrajudicial_Queue: columnas case_id o status no encontradas');
    return 0;
  }

  // Obtener case_ids ya existentes en Collection_Queue
  var existingIds = getExistingCollectionIds_(colSheet);

  var casesAdded = 0;
  var statusCol = exColIdx['status'];

  for (var i = 1; i < exData.length; i++) {
    var status = String(exData[i][statusCol]).trim();

    // Solo procesar ACEPTADA o COBRO_PENDIENTE
    if (status !== COL_CONFIG.STATUS.EX_ACCEPTED &&
        status !== COL_CONFIG.STATUS.EX_COBRO_PENDING) {
      continue;
    }

    var caseId = String(exData[i][exColIdx['case_id']]).trim();
    if (!caseId || existingIds[caseId]) continue; // Ya existe o vacío

    // Crear fila en Collection_Queue
    var compensationEur = parseFloat(exData[i][exColIdx['compensation_eur']]) || 0;
    var commission = calculateCommission_(compensationEur);
    var resolutionDate = exData[i][exColIdx['claim_sent_date']] || new Date();
    if (!(resolutionDate instanceof Date)) resolutionDate = new Date(resolutionDate);
    var paymentDeadline = addDaysCollection_(resolutionDate, COL_CONFIG.DEADLINES.PAYMENT_WAIT);

    var newRow = [
      caseId,                                                           // A: case_id
      new Date(),                                                       // B: created_at
      'AGENT4',                                                         // C: source_agent
      status,                                                           // D: source_status
      exData[i][exColIdx['passenger_name']] || '',                      // E: passenger_name
      exData[i][exColIdx['passenger_email']] || '',                     // F: passenger_email
      exData[i][exColIdx['passenger_phone']] || '',                     // G: passenger_phone
      exData[i][exColIdx['airline_name']] || '',                        // H: airline_name
      exData[i][exColIdx['flight_number']] || '',                       // I: flight_number
      exData[i][exColIdx['flight_date']] || '',                         // J: flight_date
      exData[i][exColIdx['incident_type']] || '',                       // K: incident_type
      compensationEur,                                                  // L: compensation_eur
      'EXTRAJUDICIAL',                                                  // M: resolution_type
      resolutionDate,                                                   // N: resolution_date
      '',                                                               // O: resolution_reference
      paymentDeadline,                                                  // P: payment_deadline
      '',                                                               // Q: instructions_sent_date
      '',                                                               // R: passenger_confirmed_payment
      '',                                                               // S: payment_confirmed_date
      commission.total,                                                 // T: commission_amount
      '',                                                               // U: commission_invoice_sent
      '',                                                               // V: commission_invoice_date
      '',                                                               // W: commission_paid
      COL_CONFIG.STATUS.PENDING,                                        // X: status
      new Date()                                                        // Y: status_updated_at
    ];

    colSheet.appendRow(newRow);
    casesAdded++;
    existingIds[caseId] = true;

    // Actualizar status en Extrajudicial_Queue → PROCESADO_COBRO
    exSheet.getRange(i + 1, statusCol + 1).setValue(COL_CONFIG.STATUS.EX_PROCESSED_COBRO);

    logActionCollection_(ss, caseId, 'NUEVO_CASO_EX', 'Caso importado desde Extrajudicial_Queue (status: ' + status + ')');
  }

  return casesAdded;
}

/**
 * Escanear AESA_Queue para casos COBRO_PENDIENTE
 */
function scanAESAForCollection_(ss, colSheet) {
  var aesaSheet = ss.getSheetByName(COL_CONFIG.SHEETS.AESA_QUEUE);
  if (!aesaSheet || aesaSheet.getLastRow() < 2) return 0;

  var aesaData = aesaSheet.getDataRange().getValues();
  var aesaHeaders = aesaData[0];

  // Buscar columnas en AESA_Queue
  var aesaColIdx = {};
  var neededCols = ['case_id', 'passenger_name', 'passenger_email', 'passenger_phone',
                    'airline_name', 'flight_number', 'flight_date', 'incident_type',
                    'compensation_eur', 'status', 'aesa_decision_date', 'aesa_expediente_num'];
  for (var h = 0; h < aesaHeaders.length; h++) {
    if (neededCols.indexOf(aesaHeaders[h]) >= 0) {
      aesaColIdx[aesaHeaders[h]] = h;
    }
  }

  if (aesaColIdx['case_id'] === undefined || aesaColIdx['status'] === undefined) {
    logActionCollection_(ss, 'SYSTEM', 'WARNING', 'AESA_Queue: columnas case_id o status no encontradas');
    return 0;
  }

  var existingIds = getExistingCollectionIds_(colSheet);
  var casesAdded = 0;
  var statusCol = aesaColIdx['status'];

  for (var i = 1; i < aesaData.length; i++) {
    var status = String(aesaData[i][statusCol]).trim();

    if (status !== COL_CONFIG.STATUS.AESA_COBRO_PENDING) continue;

    var caseId = String(aesaData[i][aesaColIdx['case_id']]).trim();
    if (!caseId || existingIds[caseId]) continue;

    var compensationEur = parseFloat(aesaData[i][aesaColIdx['compensation_eur']]) || 0;
    var commission = calculateCommission_(compensationEur);
    var resolutionDate = aesaData[i][aesaColIdx['aesa_decision_date']] || new Date();
    if (!(resolutionDate instanceof Date)) resolutionDate = new Date(resolutionDate);
    var paymentDeadline = addDaysCollection_(resolutionDate, COL_CONFIG.DEADLINES.PAYMENT_WAIT);

    var newRow = [
      caseId,                                                           // A: case_id
      new Date(),                                                       // B: created_at
      'AGENT5',                                                         // C: source_agent
      status,                                                           // D: source_status
      aesaData[i][aesaColIdx['passenger_name']] || '',                  // E: passenger_name
      aesaData[i][aesaColIdx['passenger_email']] || '',                 // F: passenger_email
      aesaData[i][aesaColIdx['passenger_phone']] || '',                 // G: passenger_phone
      aesaData[i][aesaColIdx['airline_name']] || '',                    // H: airline_name
      aesaData[i][aesaColIdx['flight_number']] || '',                   // I: flight_number
      aesaData[i][aesaColIdx['flight_date']] || '',                     // J: flight_date
      aesaData[i][aesaColIdx['incident_type']] || '',                   // K: incident_type
      compensationEur,                                                  // L: compensation_eur
      'AESA',                                                           // M: resolution_type
      resolutionDate,                                                   // N: resolution_date
      aesaData[i][aesaColIdx['aesa_expediente_num']] || '',             // O: resolution_reference
      paymentDeadline,                                                  // P: payment_deadline
      '',                                                               // Q: instructions_sent_date
      '',                                                               // R: passenger_confirmed_payment
      '',                                                               // S: payment_confirmed_date
      commission.total,                                                 // T: commission_amount
      '',                                                               // U: commission_invoice_sent
      '',                                                               // V: commission_invoice_date
      '',                                                               // W: commission_paid
      COL_CONFIG.STATUS.PENDING,                                        // X: status
      new Date()                                                        // Y: status_updated_at
    ];

    colSheet.appendRow(newRow);
    casesAdded++;
    existingIds[caseId] = true;

    // Actualizar status en AESA_Queue → PROCESADO_COBRO
    aesaSheet.getRange(i + 1, statusCol + 1).setValue(COL_CONFIG.STATUS.AESA_PROCESSED_COBRO);

    logActionCollection_(ss, caseId, 'NUEVO_CASO_AESA', 'Caso importado desde AESA_Queue (decisión favorable)');
  }

  return casesAdded;
}

/**
 * Obtener IDs existentes en Collection_Queue (para evitar duplicados)
 */
function getExistingCollectionIds_(colSheet) {
  var ids = {};
  if (colSheet.getLastRow() < 2) return ids;
  var data = colSheet.getRange(2, 1, colSheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    var id = String(data[i][0]).trim();
    if (id) ids[id] = true;
  }
  return ids;
}

/**
 * Procesar casos con status PENDIENTE_COBRO → enviar instrucciones
 */
function processNewPendingCases_(ss, colSheet) {
  if (colSheet.getLastRow() < 2) return;

  var data = colSheet.getDataRange().getValues();
  var headers = data[0];

  // Buscar columnas
  var colIdx = {};
  for (var h = 0; h < headers.length; h++) {
    colIdx[headers[h]] = h;
  }

  var statusColNum = colIdx['status'] + 1; // 1-based para getRange
  var today = new Date();

  for (var i = 1; i < data.length; i++) {
    var status = String(data[i][colIdx['status']]).trim();
    if (status !== COL_CONFIG.STATUS.PENDING) continue;

    var caseId = String(data[i][colIdx['case_id']]).trim();
    var passengerName = String(data[i][colIdx['passenger_name']]).trim();
    var passengerEmail = String(data[i][colIdx['passenger_email']]).trim();
    var airlineName = String(data[i][colIdx['airline_name']]).trim();
    var flightNumber = String(data[i][colIdx['flight_number']]).trim();
    var flightDate = data[i][colIdx['flight_date']];
    var compensationEur = parseFloat(data[i][colIdx['compensation_eur']]) || 0;
    var resolutionType = String(data[i][colIdx['resolution_type']]).trim();
    var resolutionDate = data[i][colIdx['resolution_date']];
    var paymentDeadline = data[i][colIdx['payment_deadline']];
    var commissionAmount = parseFloat(data[i][colIdx['commission_amount']]) || 0;

    if (!passengerEmail) {
      logActionCollection_(ss, caseId, 'ERROR', 'Sin email de pasajero, no se pueden enviar instrucciones');
      colSheet.getRange(i + 1, statusColNum).setValue(COL_CONFIG.STATUS.MANUAL_REVIEW);
      colSheet.getRange(i + 1, colIdx['status_updated_at'] + 1).setValue(today);
      continue;
    }

    // Generar y enviar email de instrucciones
    var emailHtml = generateInstructionsEmail_(
      passengerName, caseId, flightNumber,
      flightDate instanceof Date ? formatDateCollection_(flightDate) : String(flightDate),
      airlineName, compensationEur, resolutionType,
      resolutionDate instanceof Date ? formatDateCollection_(resolutionDate) : String(resolutionDate),
      paymentDeadline instanceof Date ? formatDateCollection_(paymentDeadline) : String(paymentDeadline),
      commissionAmount
    );

    var subject = 'AeroReclaim — ¡Buenas noticias! Tu compensación de ' + compensationEur + '€ está en camino — Exp. ' + caseId;
    var sent = sendEmailCollection_(passengerEmail, subject, emailHtml, caseId);

    if (sent) {
      colSheet.getRange(i + 1, colIdx['instructions_sent_date'] + 1).setValue(today);
      colSheet.getRange(i + 1, statusColNum).setValue(COL_CONFIG.STATUS.INSTRUCTIONS_SENT);
      colSheet.getRange(i + 1, colIdx['status_updated_at'] + 1).setValue(today);
      logActionCollection_(ss, caseId, 'INSTRUCCIONES_ENVIADAS', 'Email de instrucciones enviado a ' + passengerEmail);
    } else {
      logActionCollection_(ss, caseId, 'ERROR_EMAIL', 'No se pudo enviar email de instrucciones a ' + passengerEmail);
    }
  }
}


// ═══════════════════════════════════════════════════════════════
// MÓDULO 2: SEGUIMIENTO Y EMAILS (trigger cada 15 min)
// ═══════════════════════════════════════════════════════════════

function processCollectionFollowups() {
  var ss = SpreadsheetApp.openById(COL_CONFIG.SPREADSHEET_ID);
  var colSheet = ss.getSheetByName(COL_CONFIG.SHEETS.COLLECTION_QUEUE);
  if (!colSheet || colSheet.getLastRow() < 2) return;

  var data = colSheet.getDataRange().getValues();
  var headers = data[0];
  var colIdx = {};
  for (var h = 0; h < headers.length; h++) {
    colIdx[headers[h]] = h;
  }

  // Recopilar case_ids activos y sus emails para buscar en Gmail
  var activeCases = [];
  for (var i = 1; i < data.length; i++) {
    var status = String(data[i][colIdx['status']]).trim();
    // Solo monitorizar en estados donde esperamos respuesta del pasajero
    if (status === COL_CONFIG.STATUS.INSTRUCTIONS_SENT ||
        status === COL_CONFIG.STATUS.REMINDER_SENT ||
        status === COL_CONFIG.STATUS.REMINDER_2_SENT ||
        status === COL_CONFIG.STATUS.INVOICE_SENT) {
      activeCases.push({
        row: i + 1,
        caseId: String(data[i][colIdx['case_id']]).trim(),
        passengerEmail: String(data[i][colIdx['passenger_email']]).trim(),
        status: status,
        instructionsSentDate: data[i][colIdx['instructions_sent_date']],
        invoiceDate: data[i][colIdx['commission_invoice_date']]
      });
    }
  }

  if (activeCases.length === 0) return;

  // Buscar emails de respuesta en Gmail
  for (var c = 0; c < activeCases.length; c++) {
    try {
      processPassengerResponse_(ss, colSheet, colIdx, activeCases[c]);
    } catch (e) {
      logActionCollection_(ss, activeCases[c].caseId, 'ERROR', 'Error procesando respuesta: ' + e.message);
    }
  }
}

/**
 * Procesar respuestas de un pasajero específico
 */
function processPassengerResponse_(ss, colSheet, colIdx, caseInfo) {
  var caseId = caseInfo.caseId;
  var passengerEmail = caseInfo.passengerEmail;

  if (!passengerEmail) return;

  // Buscar emails del pasajero que mencionen el case_id
  var searchQuery = 'from:' + passengerEmail + ' subject:' + caseId + ' newer_than:30d';
  var threads = GmailApp.search(searchQuery, 0, 5);

  if (threads.length === 0) {
    // También buscar sin case_id en subject pero con referencia en body
    searchQuery = 'from:' + passengerEmail + ' ' + caseId + ' newer_than:30d';
    threads = GmailApp.search(searchQuery, 0, 5);
  }

  if (threads.length === 0) return;

  // Analizar el mensaje más reciente
  for (var t = 0; t < threads.length; t++) {
    var messages = threads[t].getMessages();
    var latestMsg = messages[messages.length - 1];
    var msgDate = latestMsg.getDate();
    var msgBody = latestMsg.getPlainBody().toLowerCase();

    // Determinar si ya procesamos este mensaje (comparar con último status update)
    var lastUpdate = colSheet.getRange(caseInfo.row, colIdx['status_updated_at'] + 1).getValue();
    if (lastUpdate instanceof Date && msgDate <= lastUpdate) continue;

    // ─── Estado: Esperando confirmación de pago ───
    if (caseInfo.status === COL_CONFIG.STATUS.INSTRUCTIONS_SENT ||
        caseInfo.status === COL_CONFIG.STATUS.REMINDER_SENT ||
        caseInfo.status === COL_CONFIG.STATUS.REMINDER_2_SENT) {

      if (matchesKeywords_(msgBody, COL_CONFIG.PAYMENT_CONFIRM_KEYWORDS)) {
        // PAGO CONFIRMADO
        handlePaymentConfirmed_(ss, colSheet, colIdx, caseInfo, msgDate);
        return;
      } else if (matchesKeywords_(msgBody, COL_CONFIG.PAYMENT_PROBLEM_KEYWORDS)) {
        // PROBLEMA — escalar
        handlePaymentProblem_(ss, colSheet, colIdx, caseInfo, msgBody);
        return;
      }
      // Si no coincide con nada, ignorar (podría ser spam o irrelevante)
    }

    // ─── Estado: Esperando pago de comisión ───
    if (caseInfo.status === COL_CONFIG.STATUS.INVOICE_SENT) {
      if (matchesKeywords_(msgBody, COL_CONFIG.COMMISSION_CONFIRM_KEYWORDS)) {
        handleCommissionPaid_(ss, colSheet, colIdx, caseInfo, msgDate);
        return;
      }
    }
  }
}

/**
 * Comprobar si el texto contiene alguna de las keywords
 */
function matchesKeywords_(text, keywords) {
  for (var k = 0; k < keywords.length; k++) {
    if (text.indexOf(keywords[k].toLowerCase()) >= 0) {
      return true;
    }
  }
  return false;
}

/**
 * Manejar confirmación de pago del pasajero
 */
function handlePaymentConfirmed_(ss, colSheet, colIdx, caseInfo, confirmDate) {
  var today = new Date();
  var row = caseInfo.row;

  // Actualizar Collection_Queue
  colSheet.getRange(row, colIdx['passenger_confirmed_payment'] + 1).setValue(true);
  colSheet.getRange(row, colIdx['payment_confirmed_date'] + 1).setValue(confirmDate || today);
  colSheet.getRange(row, colIdx['status'] + 1).setValue(COL_CONFIG.STATUS.PAYMENT_CONFIRMED);
  colSheet.getRange(row, colIdx['status_updated_at'] + 1).setValue(today);

  logActionCollection_(ss, caseInfo.caseId, 'PAGO_CONFIRMADO', 'Pasajero confirma haber recibido pago de la aerolínea');

  // Enviar factura de comisión
  var data = colSheet.getRange(row, 1, 1, colSheet.getLastColumn()).getValues()[0];
  var passengerName = String(data[colIdx['passenger_name']]).trim();
  var passengerEmail = String(data[colIdx['passenger_email']]).trim();
  var compensationEur = parseFloat(data[colIdx['compensation_eur']]) || 0;
  var commissionAmount = parseFloat(data[colIdx['commission_amount']]) || 0;
  var commission = calculateCommission_(compensationEur);

  var invoiceHtml = generateInvoiceEmail_(
    passengerName, caseInfo.caseId, compensationEur,
    commission.base, commission.iva, commission.total
  );

  var subject = 'AeroReclaim — Factura de comisión — Exp. ' + caseInfo.caseId;
  var sent = sendEmailCollection_(passengerEmail, subject, invoiceHtml, caseInfo.caseId);

  if (sent) {
    colSheet.getRange(row, colIdx['commission_invoice_sent'] + 1).setValue(true);
    colSheet.getRange(row, colIdx['commission_invoice_date'] + 1).setValue(today);
    colSheet.getRange(row, colIdx['status'] + 1).setValue(COL_CONFIG.STATUS.INVOICE_SENT);
    colSheet.getRange(row, colIdx['status_updated_at'] + 1).setValue(today);
    logActionCollection_(ss, caseInfo.caseId, 'FACTURA_ENVIADA', 'Factura de comisión enviada: ' + commission.total + '€');
  }

  // Notificar internamente
  notifyInternalCollection_(
    '[Agent 6] PAGO CONFIRMADO — Exp. ' + caseInfo.caseId,
    '<h2>✅ Pago de aerolínea confirmado</h2>' +
    '<p><strong>Expediente:</strong> ' + caseInfo.caseId + '</p>' +
    '<p><strong>Pasajero:</strong> ' + passengerName + '</p>' +
    '<p><strong>Compensación:</strong> ' + compensationEur + '€</p>' +
    '<p><strong>Comisión facturada:</strong> ' + commission.total + '€</p>' +
    '<p>Factura de comisión enviada al pasajero.</p>'
  );
}

/**
 * Manejar problema reportado por pasajero
 */
function handlePaymentProblem_(ss, colSheet, colIdx, caseInfo, msgBody) {
  var today = new Date();
  colSheet.getRange(caseInfo.row, colIdx['status'] + 1).setValue(COL_CONFIG.STATUS.ESCALATED);
  colSheet.getRange(caseInfo.row, colIdx['status_updated_at'] + 1).setValue(today);

  logActionCollection_(ss, caseInfo.caseId, 'ESCALADA', 'Pasajero reporta problema con el pago');

  var data = colSheet.getRange(caseInfo.row, 1, 1, colSheet.getLastColumn()).getValues()[0];
  notifyInternalCollection_(
    '[Agent 6] ⚠️ PROBLEMA COBRO — Exp. ' + caseInfo.caseId,
    '<h2>⚠️ Pasajero reporta problema</h2>' +
    '<p><strong>Expediente:</strong> ' + caseInfo.caseId + '</p>' +
    '<p><strong>Pasajero:</strong> ' + String(data[colIdx['passenger_name']]).trim() + '</p>' +
    '<p><strong>Email:</strong> ' + caseInfo.passengerEmail + '</p>' +
    '<p><strong>Aerolínea:</strong> ' + String(data[colIdx['airline_name']]).trim() + '</p>' +
    '<p><strong>Compensación:</strong> ' + data[colIdx['compensation_eur']] + '€</p>' +
    '<hr>' +
    '<p><strong>Extracto del mensaje:</strong></p>' +
    '<blockquote>' + msgBody.substring(0, 500) + '</blockquote>' +
    '<hr>' +
    '<p>Requiere intervención manual.</p>'
  );
}

/**
 * Manejar confirmación de pago de comisión
 */
function handleCommissionPaid_(ss, colSheet, colIdx, caseInfo, payDate) {
  var today = new Date();
  var row = caseInfo.row;

  colSheet.getRange(row, colIdx['commission_paid'] + 1).setValue(true);
  colSheet.getRange(row, colIdx['status'] + 1).setValue(COL_CONFIG.STATUS.COMMISSION_COLLECTED);
  colSheet.getRange(row, colIdx['status_updated_at'] + 1).setValue(today);

  logActionCollection_(ss, caseInfo.caseId, 'COMISION_COBRADA', 'Pasajero confirma pago de comisión');

  // Enviar email de cierre al pasajero
  var data = colSheet.getRange(row, 1, 1, colSheet.getLastColumn()).getValues()[0];
  var passengerName = String(data[colIdx['passenger_name']]).trim();
  var passengerEmail = String(data[colIdx['passenger_email']]).trim();
  var compensationEur = parseFloat(data[colIdx['compensation_eur']]) || 0;
  var commissionAmount = parseFloat(data[colIdx['commission_amount']]) || 0;

  var closingHtml = generateClosingEmail_(passengerName, caseInfo.caseId, compensationEur, commissionAmount);
  var subject = 'AeroReclaim — ¡Caso completado con éxito! — Exp. ' + caseInfo.caseId;
  sendEmailCollection_(passengerEmail, subject, closingHtml, caseInfo.caseId);

  // Cerrar caso
  colSheet.getRange(row, colIdx['status'] + 1).setValue(COL_CONFIG.STATUS.CLOSED_SUCCESS);
  colSheet.getRange(row, colIdx['status_updated_at'] + 1).setValue(today);

  logActionCollection_(ss, caseInfo.caseId, 'CERRADO_EXITOSO', 'Caso cerrado exitosamente. Comisión cobrada: ' + commissionAmount + '€');

  // Notificar internamente
  notifyInternalCollection_(
    '[Agent 6] ✅ CASO CERRADO — Exp. ' + caseInfo.caseId,
    '<h2>🎉 Caso cerrado con éxito</h2>' +
    '<p><strong>Expediente:</strong> ' + caseInfo.caseId + '</p>' +
    '<p><strong>Pasajero:</strong> ' + passengerName + '</p>' +
    '<p><strong>Compensación cobrada:</strong> ' + compensationEur + '€</p>' +
    '<p><strong>Comisión ingresada:</strong> ' + commissionAmount + '€</p>'
  );
}


// ═══════════════════════════════════════════════════════════════
// MÓDULO 3: PLAZOS Y DEADLINES (trigger diario 10:00)
// ═══════════════════════════════════════════════════════════════

function processCollectionDeadlines() {
  var ss = SpreadsheetApp.openById(COL_CONFIG.SPREADSHEET_ID);
  var colSheet = ss.getSheetByName(COL_CONFIG.SHEETS.COLLECTION_QUEUE);
  if (!colSheet || colSheet.getLastRow() < 2) return;

  var data = colSheet.getDataRange().getValues();
  var headers = data[0];
  var colIdx = {};
  for (var h = 0; h < headers.length; h++) {
    colIdx[headers[h]] = h;
  }

  var today = new Date();
  var alertSummary = [];

  for (var i = 1; i < data.length; i++) {
    var status = String(data[i][colIdx['status']]).trim();
    var caseId = String(data[i][colIdx['case_id']]).trim();
    var row = i + 1;

    if (!caseId) continue;

    try {
      // ─── Recordatorios de pago de aerolínea ───
      if (status === COL_CONFIG.STATUS.INSTRUCTIONS_SENT) {
        var instructionsDate = data[i][colIdx['instructions_sent_date']];
        if (instructionsDate instanceof Date) {
          var daysSinceInstructions = daysBetweenCollection_(instructionsDate, today);

          if (daysSinceInstructions >= COL_CONFIG.DEADLINES.ESCALATE_DAYS) {
            // 45+ días sin confirmación → escalar
            handleEscalation_(ss, colSheet, colIdx, data[i], row, caseId, daysSinceInstructions);
            alertSummary.push('🔴 ' + caseId + ': ' + daysSinceInstructions + ' días sin confirmación → ESCALADO');
          } else if (daysSinceInstructions >= COL_CONFIG.DEADLINES.REMINDER_2_DAYS) {
            // 30+ días → segundo recordatorio
            sendPaymentReminder_(ss, colSheet, colIdx, data[i], row, caseId, 2);
            alertSummary.push('🟠 ' + caseId + ': ' + daysSinceInstructions + ' días → Recordatorio 2');
          } else if (daysSinceInstructions >= COL_CONFIG.DEADLINES.REMINDER_1_DAYS) {
            // 15+ días → primer recordatorio
            sendPaymentReminder_(ss, colSheet, colIdx, data[i], row, caseId, 1);
            alertSummary.push('🟡 ' + caseId + ': ' + daysSinceInstructions + ' días → Recordatorio 1');
          }
        }
      }

      // ─── Recordatorios tras primer recordatorio ───
      if (status === COL_CONFIG.STATUS.REMINDER_SENT) {
        var instructionsDate2 = data[i][colIdx['instructions_sent_date']];
        if (instructionsDate2 instanceof Date) {
          var daysSince2 = daysBetweenCollection_(instructionsDate2, today);

          if (daysSince2 >= COL_CONFIG.DEADLINES.ESCALATE_DAYS) {
            handleEscalation_(ss, colSheet, colIdx, data[i], row, caseId, daysSince2);
            alertSummary.push('🔴 ' + caseId + ': ' + daysSince2 + ' días sin confirmación → ESCALADO');
          } else if (daysSince2 >= COL_CONFIG.DEADLINES.REMINDER_2_DAYS) {
            sendPaymentReminder_(ss, colSheet, colIdx, data[i], row, caseId, 2);
            alertSummary.push('🟠 ' + caseId + ': ' + daysSince2 + ' días → Recordatorio 2');
          }
        }
      }

      // ─── Recordatorio segundo → escalada ───
      if (status === COL_CONFIG.STATUS.REMINDER_2_SENT) {
        var instructionsDate3 = data[i][colIdx['instructions_sent_date']];
        if (instructionsDate3 instanceof Date) {
          var daysSince3 = daysBetweenCollection_(instructionsDate3, today);
          if (daysSince3 >= COL_CONFIG.DEADLINES.ESCALATE_DAYS) {
            handleEscalation_(ss, colSheet, colIdx, data[i], row, caseId, daysSince3);
            alertSummary.push('🔴 ' + caseId + ': ' + daysSince3 + ' días → ESCALADO');
          }
        }
      }

      // ─── Recordatorios de comisión ───
      if (status === COL_CONFIG.STATUS.INVOICE_SENT) {
        var invoiceDate = data[i][colIdx['commission_invoice_date']];
        if (invoiceDate instanceof Date) {
          var daysSinceInvoice = daysBetweenCollection_(invoiceDate, today);

          if (daysSinceInvoice >= COL_CONFIG.DEADLINES.COMMISSION_REMINDER_2) {
            // 30+ días sin pago de comisión → alerta urgente
            sendCommissionReminder_(ss, colSheet, colIdx, data[i], row, caseId, 2);
            alertSummary.push('🟠 ' + caseId + ': Comisión impagada ' + daysSinceInvoice + ' días');
          } else if (daysSinceInvoice >= COL_CONFIG.DEADLINES.COMMISSION_REMINDER_1) {
            // 15+ días → recordatorio amable
            sendCommissionReminder_(ss, colSheet, colIdx, data[i], row, caseId, 1);
            alertSummary.push('🟡 ' + caseId + ': Recordatorio comisión (' + daysSinceInvoice + ' días)');
          }
        }
      }

    } catch (e) {
      logActionCollection_(ss, caseId, 'ERROR', 'Error en processCollectionDeadlines: ' + e.message);
    }
  }

  // Enviar resumen diario si hay alertas
  if (alertSummary.length > 0) {
    var summaryHtml = '<h2>📊 Resumen diario de cobros — Agent 6</h2>' +
      '<p>Fecha: ' + formatDateCollection_(today) + '</p>' +
      '<ul>' + alertSummary.map(function(a) { return '<li>' + a + '</li>'; }).join('') + '</ul>';

    notifyInternalCollection_(
      '[Agent 6] Resumen diario de cobros — ' + formatDateCollection_(today),
      summaryHtml
    );
  }
}

/**
 * Enviar recordatorio de pago al pasajero
 */
function sendPaymentReminder_(ss, colSheet, colIdx, rowData, row, caseId, reminderNum) {
  var today = new Date();
  var passengerName = String(rowData[colIdx['passenger_name']]).trim();
  var passengerEmail = String(rowData[colIdx['passenger_email']]).trim();
  var airlineName = String(rowData[colIdx['airline_name']]).trim();
  var compensationEur = parseFloat(rowData[colIdx['compensation_eur']]) || 0;
  var paymentDeadline = rowData[colIdx['payment_deadline']];

  if (!passengerEmail) return;

  var emailHtml = generateReminderEmail_(passengerName, caseId, airlineName, compensationEur,
    paymentDeadline instanceof Date ? formatDateCollection_(paymentDeadline) : String(paymentDeadline),
    reminderNum);

  var subject = reminderNum === 1
    ? 'AeroReclaim — Seguimiento de tu compensación — Exp. ' + caseId
    : 'AeroReclaim — Importante: Actualización sobre tu compensación — Exp. ' + caseId;

  var sent = sendEmailCollection_(passengerEmail, subject, emailHtml, caseId);

  if (sent) {
    var newStatus = reminderNum === 1 ? COL_CONFIG.STATUS.REMINDER_SENT : COL_CONFIG.STATUS.REMINDER_2_SENT;
    colSheet.getRange(row, colIdx['status'] + 1).setValue(newStatus);
    colSheet.getRange(row, colIdx['status_updated_at'] + 1).setValue(today);
    logActionCollection_(ss, caseId, 'RECORDATORIO_' + reminderNum, 'Recordatorio ' + reminderNum + ' enviado a ' + passengerEmail);
  }
}

/**
 * Enviar recordatorio de comisión
 */
function sendCommissionReminder_(ss, colSheet, colIdx, rowData, row, caseId, reminderNum) {
  var today = new Date();
  var passengerName = String(rowData[colIdx['passenger_name']]).trim();
  var passengerEmail = String(rowData[colIdx['passenger_email']]).trim();
  var commissionAmount = parseFloat(rowData[colIdx['commission_amount']]) || 0;

  if (!passengerEmail) return;

  var emailHtml = generateCommissionReminderEmail_(passengerName, caseId, commissionAmount, reminderNum);
  var subject = reminderNum === 1
    ? 'AeroReclaim — Recordatorio: Factura de comisión — Exp. ' + caseId
    : 'AeroReclaim — Importante: Factura de comisión pendiente — Exp. ' + caseId;

  var sent = sendEmailCollection_(passengerEmail, subject, emailHtml, caseId);

  if (sent) {
    logActionCollection_(ss, caseId, 'RECORDATORIO_COMISION_' + reminderNum, 'Recordatorio comisión ' + reminderNum + ' enviado');
  }

  // Si es el segundo recordatorio, alertar internamente
  if (reminderNum === 2) {
    notifyInternalCollection_(
      '[Agent 6] ⚠️ Comisión impagada — Exp. ' + caseId,
      '<h2>⚠️ Comisión sin pagar (30+ días)</h2>' +
      '<p><strong>Expediente:</strong> ' + caseId + '</p>' +
      '<p><strong>Pasajero:</strong> ' + passengerName + ' (' + passengerEmail + ')</p>' +
      '<p><strong>Comisión pendiente:</strong> ' + commissionAmount + '€</p>' +
      '<p>Considerar acción adicional.</p>'
    );
  }
}

/**
 * Manejar escalada interna (sin respuesta >45 días)
 */
function handleEscalation_(ss, colSheet, colIdx, rowData, row, caseId, daysSince) {
  var today = new Date();
  colSheet.getRange(row, colIdx['status'] + 1).setValue(COL_CONFIG.STATUS.ESCALATED);
  colSheet.getRange(row, colIdx['status_updated_at'] + 1).setValue(today);

  logActionCollection_(ss, caseId, 'ESCALADA', daysSince + ' días sin confirmación de pago → escalada interna');

  var passengerName = String(rowData[colIdx['passenger_name']]).trim();
  var airlineName = String(rowData[colIdx['airline_name']]).trim();
  var compensationEur = parseFloat(rowData[colIdx['compensation_eur']]) || 0;
  var resolutionType = String(rowData[colIdx['resolution_type']]).trim();

  notifyInternalCollection_(
    '[Agent 6] 🔴 ESCALADA — Exp. ' + caseId,
    '<h2>🔴 Caso sin respuesta — Requiere intervención</h2>' +
    '<table>' +
    '<tr><td><strong>Expediente:</strong></td><td>' + caseId + '</td></tr>' +
    '<tr><td><strong>Pasajero:</strong></td><td>' + passengerName + '</td></tr>' +
    '<tr><td><strong>Email:</strong></td><td>' + String(rowData[colIdx['passenger_email']]).trim() + '</td></tr>' +
    '<tr><td><strong>Teléfono:</strong></td><td>' + String(rowData[colIdx['passenger_phone']]).trim() + '</td></tr>' +
    '<tr><td><strong>Aerolínea:</strong></td><td>' + airlineName + '</td></tr>' +
    '<tr><td><strong>Compensación:</strong></td><td>' + compensationEur + '€</td></tr>' +
    '<tr><td><strong>Vía:</strong></td><td>' + resolutionType + '</td></tr>' +
    '<tr><td><strong>Días sin respuesta:</strong></td><td><strong>' + daysSince + ' días</strong></td></tr>' +
    '</table>' +
    '<hr>' +
    '<h3>Acciones sugeridas:</h3>' +
    '<ol>' +
    '<li>Contactar al pasajero por teléfono</li>' +
    '<li>Verificar si la aerolínea ha realizado el pago</li>' +
    '<li>Si la aerolínea no ha pagado: considerar reclamación adicional</li>' +
    '</ol>'
  );
}


// ═══════════════════════════════════════════════════════════════
// TEMPLATES DE EMAIL
// ═══════════════════════════════════════════════════════════════

/**
 * Email de instrucciones de cobro
 */
function generateInstructionsEmail_(name, caseId, flightNumber, flightDate, airline,
                                     compensation, resolutionType, resolutionDate,
                                     paymentDeadline, commissionAmount) {
  var resolutionLabel = resolutionType === 'AESA' ? 'Resolución AESA favorable' : 'Aceptación extrajudicial';

  return '<!DOCTYPE html><html><body>' +
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">' +
    // Header
    '<div style="background:#1a365d;color:white;padding:24px;text-align:center;">' +
    '<h1 style="margin:0;font-size:22px;">✈️ AeroReclaim — Agent 6</h1>' +
    '<p style="margin:5px 0 0;opacity:0.9;">Gestión de Cobro</p>' +
    '</div>' +
    // Body
    '<div style="padding:24px;">' +
    '<p>Estimado/a <strong>' + name + '</strong>,</p>' +
    '<p>Nos complace informarte de que tu reclamación ha sido <strong>resuelta favorablemente</strong>.</p>' +
    // Success box
    '<div style="background:#f0fff4;border-left:4px solid #38a169;padding:16px;margin:16px 0;border-radius:4px;">' +
    '<h3 style="color:#38a169;margin:0 0 12px;">✓ Compensación aprobada</h3>' +
    '<table style="width:100%;border-collapse:collapse;">' +
    '<tr><td style="padding:4px 8px;color:#666;">Expediente:</td><td style="padding:4px 8px;font-weight:bold;">' + caseId + '</td></tr>' +
    '<tr><td style="padding:4px 8px;color:#666;">Vuelo:</td><td style="padding:4px 8px;">' + flightNumber + ' · ' + flightDate + '</td></tr>' +
    '<tr><td style="padding:4px 8px;color:#666;">Aerolínea:</td><td style="padding:4px 8px;">' + airline + '</td></tr>' +
    '<tr><td style="padding:4px 8px;color:#666;">Compensación:</td><td style="padding:4px 8px;font-weight:bold;font-size:18px;color:#38a169;">' + compensation + '€</td></tr>' +
    '<tr><td style="padding:4px 8px;color:#666;">Vía de resolución:</td><td style="padding:4px 8px;">' + resolutionLabel + '</td></tr>' +
    '<tr><td style="padding:4px 8px;color:#666;">Fecha resolución:</td><td style="padding:4px 8px;">' + resolutionDate + '</td></tr>' +
    '</table>' +
    '</div>' +
    // Next steps
    '<h3 style="color:#1a365d;">¿Qué sucede ahora?</h3>' +
    '<ol style="line-height:1.8;">' +
    '<li>La aerolínea <strong>' + airline + '</strong> debe transferirte <strong>' + compensation + '€</strong> directamente a tu cuenta bancaria.</li>' +
    '<li>El plazo máximo para recibir el pago es de <strong>30 días</strong> (hasta el <strong>' + paymentDeadline + '</strong>).</li>' +
    '<li>Cuando recibas el pago, <strong>responde a este email</strong> confirmándolo.</li>' +
    '</ol>' +
    // Commission box
    '<div style="background:#fff8f0;border-left:4px solid #dd6b20;padding:16px;margin:16px 0;border-radius:4px;">' +
    '<h4 style="color:#dd6b20;margin:0 0 8px;">📋 Comisión AeroReclaim</h4>' +
    '<p style="margin:4px 0;">Según nuestro acuerdo de servicio, AeroReclaim cobra una comisión del <strong>25% + IVA</strong> sobre la compensación obtenida:</p>' +
    '<p style="margin:8px 0;font-size:16px;"><strong>Comisión: ' + commissionAmount + '€</strong></p>' +
    '<p style="margin:4px 0;font-size:13px;color:#666;">Te enviaremos la factura una vez confirmes haber recibido el pago de la aerolínea. Recuerda: sin cobro, sin comisión.</p>' +
    '</div>' +
    '<p>Si tienes alguna duda, responde a este email y te ayudaremos.</p>' +
    '<p style="margin-top:24px;">Un saludo,<br><strong>AeroReclaim Solutions</strong></p>' +
    '</div>' +
    // Footer
    '<div style="background:#f7f7f7;padding:16px;text-align:center;font-size:12px;color:#999;">' +
    '<p>AeroReclaim Solutions | info@aeroreclaim.com | aeroreclaim.com</p>' +
    '</div>' +
    '</div></body></html>';
}

/**
 * Email de factura de comisión
 */
function generateInvoiceEmail_(name, caseId, compensationEur, base, iva, total) {
  return '<!DOCTYPE html><html><body>' +
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">' +
    // Header
    '<div style="background:#1a365d;color:white;padding:24px;text-align:center;">' +
    '<h1 style="margin:0;font-size:22px;">✈️ AeroReclaim — Factura</h1>' +
    '<p style="margin:5px 0 0;opacity:0.9;">Comisión por gestión de reclamación</p>' +
    '</div>' +
    // Body
    '<div style="padding:24px;">' +
    '<p>Estimado/a <strong>' + name + '</strong>,</p>' +
    '<p>¡Enhorabuena por haber recibido tu compensación! A continuación te detallamos la comisión por nuestros servicios de gestión.</p>' +
    // Invoice table
    '<div style="border:2px solid #e2e8f0;border-radius:8px;overflow:hidden;margin:16px 0;">' +
    '<div style="background:#edf2f7;padding:12px 16px;font-weight:bold;font-size:14px;">FACTURA — Exp. ' + caseId + '</div>' +
    '<table style="width:100%;border-collapse:collapse;">' +
    '<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:12px 16px;">Compensación obtenida</td><td style="padding:12px 16px;text-align:right;">' + compensationEur + '€</td></tr>' +
    '<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:12px 16px;">Comisión AeroReclaim (25%)</td><td style="padding:12px 16px;text-align:right;">' + base + '€</td></tr>' +
    '<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:12px 16px;">IVA (21%)</td><td style="padding:12px 16px;text-align:right;">' + iva + '€</td></tr>' +
    '<tr style="background:#f0fff4;"><td style="padding:12px 16px;font-weight:bold;font-size:16px;">TOTAL A PAGAR</td><td style="padding:12px 16px;text-align:right;font-weight:bold;font-size:18px;color:#38a169;">' + total + '€</td></tr>' +
    '</table>' +
    '</div>' +
    // Payment methods
    '<h3 style="color:#1a365d;">Formas de pago</h3>' +
    '<div style="background:#f7fafc;padding:16px;border-radius:8px;margin:12px 0;">' +
    '<p style="margin:4px 0;"><strong>Transferencia bancaria:</strong></p>' +
    '<ul style="margin:4px 0;padding-left:20px;">' +
    '<li>IBAN: <code>' + COL_CONFIG.BANK_IBAN + '</code></li>' +
    '<li>Titular: ' + COL_CONFIG.BANK_HOLDER + '</li>' +
    '<li>Concepto: <code>Comisión AeroReclaim - ' + caseId + '</code></li>' +
    '</ul>' +
    '<p style="margin:12px 0 4px;"><strong>Bizum:</strong></p>' +
    '<ul style="margin:4px 0;padding-left:20px;">' +
    '<li>Número: ' + COL_CONFIG.BANK_BIZUM + '</li>' +
    '<li>Concepto: <code>' + caseId + '</code></li>' +
    '</ul>' +
    '</div>' +
    '<p><strong>Plazo de pago:</strong> 15 días desde la recepción de esta factura.</p>' +
    '<p>Una vez realizado el pago, <strong>responde a este email</strong> confirmándolo y cerraremos tu expediente.</p>' +
    '<p style="margin-top:24px;">Gracias por confiar en AeroReclaim,<br><strong>AeroReclaim Solutions</strong></p>' +
    '</div>' +
    // Footer
    '<div style="background:#f7f7f7;padding:16px;text-align:center;font-size:12px;color:#999;">' +
    '<p>AeroReclaim Solutions | info@aeroreclaim.com | aeroreclaim.com</p>' +
    '</div>' +
    '</div></body></html>';
}

/**
 * Email de recordatorio de pago
 */
function generateReminderEmail_(name, caseId, airline, compensation, paymentDeadline, reminderNum) {
  var isUrgent = reminderNum >= 2;
  var headerColor = isUrgent ? '#c53030' : '#dd6b20';
  var headerText = isUrgent ? '⚠️ Actualización importante' : '📋 Seguimiento';

  return '<!DOCTYPE html><html><body>' +
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">' +
    '<div style="background:' + headerColor + ';color:white;padding:24px;text-align:center;">' +
    '<h1 style="margin:0;font-size:22px;">' + headerText + '</h1>' +
    '<p style="margin:5px 0 0;opacity:0.9;">Exp. ' + caseId + '</p>' +
    '</div>' +
    '<div style="padding:24px;">' +
    '<p>Estimado/a <strong>' + name + '</strong>,</p>' +
    (isUrgent
      ? '<p>Te escribimos porque han pasado <strong>30 días</strong> desde que te informamos de la resolución favorable de tu reclamación contra <strong>' + airline + '</strong>, y aún no hemos recibido tu confirmación de pago.</p>'
      : '<p>Queremos hacer un seguimiento de tu compensación de <strong>' + compensation + '€</strong> por parte de <strong>' + airline + '</strong>.</p>'
    ) +
    '<div style="background:#fffbeb;border-left:4px solid #d69e2e;padding:16px;margin:16px 0;border-radius:4px;">' +
    '<p style="margin:0;"><strong>¿Has recibido ya el pago?</strong></p>' +
    '<ul style="margin:8px 0;padding-left:20px;">' +
    '<li><strong>Sí:</strong> Por favor, responde a este email confirmándolo.</li>' +
    '<li><strong>No:</strong> No te preocupes, responde indicándolo y nos encargaremos de investigar.</li>' +
    '</ul>' +
    '</div>' +
    (isUrgent
      ? '<p>El plazo máximo de pago era el <strong>' + paymentDeadline + '</strong>. Si la aerolínea no ha pagado, AeroReclaim puede tomar medidas adicionales en tu nombre.</p>'
      : '<p>El plazo máximo de la aerolínea para pagarte es el <strong>' + paymentDeadline + '</strong>. Algunas aerolíneas tardan más que otras, pero estamos pendientes.</p>'
    ) +
    '<p style="margin-top:24px;">Un saludo,<br><strong>AeroReclaim Solutions</strong></p>' +
    '</div>' +
    '<div style="background:#f7f7f7;padding:16px;text-align:center;font-size:12px;color:#999;">' +
    '<p>AeroReclaim Solutions | info@aeroreclaim.com</p>' +
    '</div>' +
    '</div></body></html>';
}

/**
 * Email de recordatorio de comisión
 */
function generateCommissionReminderEmail_(name, caseId, commissionAmount, reminderNum) {
  var isUrgent = reminderNum >= 2;

  return '<!DOCTYPE html><html><body>' +
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">' +
    '<div style="background:#1a365d;color:white;padding:24px;text-align:center;">' +
    '<h1 style="margin:0;font-size:22px;">Recordatorio de factura</h1>' +
    '<p style="margin:5px 0 0;opacity:0.9;">Exp. ' + caseId + '</p>' +
    '</div>' +
    '<div style="padding:24px;">' +
    '<p>Estimado/a <strong>' + name + '</strong>,</p>' +
    (isUrgent
      ? '<p>Te recordamos que la factura de comisión por la gestión de tu reclamación lleva <strong>más de 30 días pendiente de pago</strong>.</p>'
      : '<p>Te recordamos que tienes pendiente el pago de la comisión por la gestión de tu reclamación.</p>'
    ) +
    '<div style="background:#f7fafc;padding:16px;border-radius:8px;margin:16px 0;text-align:center;">' +
    '<p style="margin:0;font-size:14px;color:#666;">Importe pendiente:</p>' +
    '<p style="margin:4px 0;font-size:24px;font-weight:bold;color:#1a365d;">' + commissionAmount + '€</p>' +
    '</div>' +
    '<p>Puedes realizar el pago por <strong>transferencia bancaria</strong> o <strong>Bizum</strong> con concepto <code>' + caseId + '</code>.</p>' +
    '<p>Una vez realizado, responde a este email confirmándolo.</p>' +
    (isUrgent
      ? '<p style="color:#c53030;"><strong>Nota:</strong> El impago de la comisión acordada puede dar lugar a acciones de cobro adicionales conforme a nuestras condiciones de servicio.</p>'
      : ''
    ) +
    '<p style="margin-top:24px;">Un saludo,<br><strong>AeroReclaim Solutions</strong></p>' +
    '</div>' +
    '<div style="background:#f7f7f7;padding:16px;text-align:center;font-size:12px;color:#999;">' +
    '<p>AeroReclaim Solutions | info@aeroreclaim.com</p>' +
    '</div>' +
    '</div></body></html>';
}

/**
 * Email de cierre exitoso
 */
function generateClosingEmail_(name, caseId, compensation, commission) {
  return '<!DOCTYPE html><html><body>' +
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">' +
    '<div style="background:#38a169;color:white;padding:24px;text-align:center;">' +
    '<h1 style="margin:0;font-size:22px;">🎉 ¡Caso completado!</h1>' +
    '<p style="margin:5px 0 0;opacity:0.9;">Exp. ' + caseId + '</p>' +
    '</div>' +
    '<div style="padding:24px;">' +
    '<p>Estimado/a <strong>' + name + '</strong>,</p>' +
    '<p>Tu reclamación ha sido <strong>completada con éxito</strong>. Aquí tienes el resumen final:</p>' +
    '<div style="background:#f0fff4;padding:16px;border-radius:8px;margin:16px 0;">' +
    '<table style="width:100%;border-collapse:collapse;">' +
    '<tr><td style="padding:6px 8px;color:#666;">Compensación recibida:</td><td style="padding:6px 8px;font-weight:bold;">' + compensation + '€</td></tr>' +
    '<tr><td style="padding:6px 8px;color:#666;">Comisión AeroReclaim:</td><td style="padding:6px 8px;">' + commission + '€</td></tr>' +
    '<tr style="border-top:1px solid #c6f6d5;"><td style="padding:6px 8px;color:#666;font-weight:bold;">Beneficio neto:</td><td style="padding:6px 8px;font-weight:bold;font-size:18px;color:#38a169;">' + (compensation - commission).toFixed(2) + '€</td></tr>' +
    '</table>' +
    '</div>' +
    // Review request
    '<div style="background:#ebf8ff;padding:16px;border-radius:8px;margin:16px 0;text-align:center;">' +
    '<h3 style="color:#2b6cb0;margin:0 0 8px;">¿Satisfecho con nuestro servicio?</h3>' +
    '<p style="margin:4px 0;">Tu opinión nos ayuda a seguir mejorando y a ayudar a más pasajeros.</p>' +
    '<p style="margin:8px 0;"><a href="https://g.page/r/aeroreclaim/review" style="background:#2b6cb0;color:white;padding:10px 24px;text-decoration:none;border-radius:4px;display:inline-block;">Dejar una reseña en Google ⭐</a></p>' +
    '</div>' +
    // Referral
    '<div style="background:#faf5ff;padding:16px;border-radius:8px;margin:16px 0;text-align:center;">' +
    '<h3 style="color:#6b46c1;margin:0 0 8px;">¿Conoces a alguien con un vuelo problemático?</h3>' +
    '<p style="margin:4px 0;">Recomiéndanos a amigos y familia. Reclamar es gratis hasta que se cobra.</p>' +
    '<p style="margin:4px 0;"><strong>aeroreclaim.com</strong></p>' +
    '</div>' +
    '<p>Gracias por confiar en AeroReclaim. Esperamos no tener que verte de nuevo... ¡pero si vuelves a tener un problema con un vuelo, ya sabes dónde estamos!</p>' +
    '<p style="margin-top:24px;">Un saludo cordial,<br><strong>AeroReclaim Solutions</strong></p>' +
    '</div>' +
    '<div style="background:#f7f7f7;padding:16px;text-align:center;font-size:12px;color:#999;">' +
    '<p>AeroReclaim Solutions | info@aeroreclaim.com | aeroreclaim.com</p>' +
    '</div>' +
    '</div></body></html>';
}


// ═══════════════════════════════════════════════════════════════
// TRIGGERS — INSTALADOR
// ═══════════════════════════════════════════════════════════════

/**
 * Instalar los 3 triggers del Agent 6.
 * SOLO elimina triggers de Agent 6 — NO toca los de Agents 1-5.
 */
function installCollectionTriggers() {
  var ss = SpreadsheetApp.openById(COL_CONFIG.SPREADSHEET_ID);

  // Eliminar solo triggers de Agent 6
  var allTriggers = ScriptApp.getProjectTriggers();
  var agent6Functions = ['processNewCollectionCases', 'processCollectionFollowups', 'processCollectionDeadlines'];
  var removed = 0;

  for (var i = 0; i < allTriggers.length; i++) {
    if (agent6Functions.indexOf(allTriggers[i].getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(allTriggers[i]);
      removed++;
    }
  }

  if (removed > 0) {
    Logger.log('Eliminados ' + removed + ' triggers anteriores de Agent 6');
  }

  // Crear nuevos triggers
  // 1. processNewCollectionCases — cada 5 min
  ScriptApp.newTrigger('processNewCollectionCases')
    .timeBased()
    .everyMinutes(5)
    .create();

  // 2. processCollectionFollowups — cada 15 min
  ScriptApp.newTrigger('processCollectionFollowups')
    .timeBased()
    .everyMinutes(15)
    .create();

  // 3. processCollectionDeadlines — diario a las 10:00
  ScriptApp.newTrigger('processCollectionDeadlines')
    .timeBased()
    .atHour(10)
    .everyDays(1)
    .create();

  Logger.log('═══════════════════════════════════════');
  Logger.log('3 triggers de Agent 6 (Collection) instalados correctamente');
  Logger.log('  1. processNewCollectionCases  — cada 5 min');
  Logger.log('  2. processCollectionFollowups — cada 15 min');
  Logger.log('  3. processCollectionDeadlines — diario 10:00');
  Logger.log('═══════════════════════════════════════');

  // Verificar total
  var totalTriggers = ScriptApp.getProjectTriggers().length;
  Logger.log('Total triggers activos: ' + totalTriggers);

  logActionCollection_(ss, 'SYSTEM', 'TRIGGERS_INSTALLED', '3 triggers de Agent 6 instalados. Total: ' + totalTriggers);
}


// ═══════════════════════════════════════════════════════════════
// FUNCIONES DE TEST
// ═══════════════════════════════════════════════════════════════

/**
 * Test 1: Verificar configuración y pestañas
 */
function testCollectionConfig() {
  Logger.log('═══════════════════════════════════════');
  Logger.log('TEST: Configuración Agent 6 (Collection)');
  Logger.log('═══════════════════════════════════════');

  var ss = SpreadsheetApp.openById(COL_CONFIG.SPREADSHEET_ID);
  var allOk = true;

  // Check Collection_Queue
  var colSheet = ss.getSheetByName(COL_CONFIG.SHEETS.COLLECTION_QUEUE);
  if (colSheet) {
    var headers = colSheet.getRange(1, 1, 1, colSheet.getLastColumn()).getValues()[0];
    Logger.log('✓ Collection_Queue: encontrada (' + headers.length + ' columnas)');
    if (headers.length < 25) {
      Logger.log('  ⚠️ Se esperaban 25 columnas (A-Y), encontradas: ' + headers.length);
      allOk = false;
    }
    Logger.log('  Headers: ' + headers.join(', '));
  } else {
    Logger.log('✗ Collection_Queue: NO encontrada');
    allOk = false;
  }

  // Check Agent6_Log
  var logSheet = ss.getSheetByName(COL_CONFIG.SHEETS.LOG);
  if (logSheet) {
    Logger.log('✓ Agent6_Log: encontrada');
  } else {
    Logger.log('✗ Agent6_Log: NO encontrada');
    allOk = false;
  }

  // Check source sheets
  var exSheet = ss.getSheetByName(COL_CONFIG.SHEETS.EXTRAJUDICIAL_QUEUE);
  Logger.log(exSheet ? '✓ Extrajudicial_Queue: encontrada' : '✗ Extrajudicial_Queue: NO encontrada');

  var aesaSheet = ss.getSheetByName(COL_CONFIG.SHEETS.AESA_QUEUE);
  Logger.log(aesaSheet ? '✓ AESA_Queue: encontrada' : '✗ AESA_Queue: NO encontrada');

  // Check commission calculation
  var testComm = calculateCommission_(250);
  Logger.log('');
  Logger.log('Test cálculo comisión (250€):');
  Logger.log('  Base: ' + testComm.base + '€ (esperado: 62.5€)');
  Logger.log('  IVA: ' + testComm.iva + '€ (esperado: 13.13€)');
  Logger.log('  Total: ' + testComm.total + '€ (esperado: 75.63€)');

  Logger.log('');
  Logger.log(allOk ? '✅ Todas las verificaciones OK' : '❌ Hay problemas — revisar arriba');
  Logger.log('═══════════════════════════════════════');
}

/**
 * Test 2: Verificar cálculos de comisión
 */
function testCollectionCommission() {
  Logger.log('═══════════════════════════════════════');
  Logger.log('TEST: Cálculos de comisión');
  Logger.log('═══════════════════════════════════════');

  var testCases = [
    { compensation: 250, expectedTotal: 75.63 },
    { compensation: 400, expectedTotal: 121.00 },
    { compensation: 600, expectedTotal: 181.50 }
  ];

  var allOk = true;
  for (var t = 0; t < testCases.length; t++) {
    var tc = testCases[t];
    var result = calculateCommission_(tc.compensation);
    var ok = Math.abs(result.total - tc.expectedTotal) < 0.01;
    Logger.log(
      (ok ? '✓' : '✗') + ' Compensación ' + tc.compensation + '€ → ' +
      'Base: ' + result.base + '€, IVA: ' + result.iva + '€, Total: ' + result.total + '€' +
      (ok ? '' : ' (esperado: ' + tc.expectedTotal + '€)')
    );
    if (!ok) allOk = false;
  }

  Logger.log('');
  Logger.log(allOk ? '✅ Todos los cálculos correctos' : '❌ Hay errores en los cálculos');
  Logger.log('═══════════════════════════════════════');
}

/**
 * Test 3: Enviar email de prueba de instrucciones
 */
function testCollectionInstructionsEmail() {
  Logger.log('═══════════════════════════════════════');
  Logger.log('TEST: Email de instrucciones de cobro');
  Logger.log('═══════════════════════════════════════');

  var commission = calculateCommission_(250);

  var html = generateInstructionsEmail_(
    'María García López',
    'AR-TEST-COL-001',
    'VY7821',
    '15/10/2024',
    'Vueling Airlines',
    250,
    'EXTRAJUDICIAL',
    '06/03/2026',
    '05/04/2026',
    commission.total
  );

  var subject = 'AeroReclaim — ¡Buenas noticias! Tu compensación de 250€ está en camino — Exp. AR-TEST-COL-001';

  try {
    GmailApp.sendEmail(COL_CONFIG.AERORECLAIM_EMAIL, '[TEST] ' + subject, '', {
      htmlBody: html,
      name: COL_CONFIG.AERORECLAIM_NAME
    });
    Logger.log('✓ Email de instrucciones enviado a ' + COL_CONFIG.AERORECLAIM_EMAIL);
    Logger.log('  Subject: [TEST] ' + subject);
    Logger.log('  Comisión calculada: ' + commission.total + '€');
  } catch (e) {
    Logger.log('✗ Error enviando email: ' + e.message);
  }

  Logger.log('═══════════════════════════════════════');
}

/**
 * Test 4: Enviar email de prueba de factura
 */
function testCollectionInvoiceEmail() {
  Logger.log('═══════════════════════════════════════');
  Logger.log('TEST: Email de factura de comisión');
  Logger.log('═══════════════════════════════════════');

  var commission = calculateCommission_(250);

  var html = generateInvoiceEmail_(
    'María García López',
    'AR-TEST-COL-001',
    250,
    commission.base,
    commission.iva,
    commission.total
  );

  var subject = 'AeroReclaim — Factura de comisión — Exp. AR-TEST-COL-001';

  try {
    GmailApp.sendEmail(COL_CONFIG.AERORECLAIM_EMAIL, '[TEST] ' + subject, '', {
      htmlBody: html,
      name: COL_CONFIG.AERORECLAIM_NAME
    });
    Logger.log('✓ Email de factura enviado a ' + COL_CONFIG.AERORECLAIM_EMAIL);
    Logger.log('  Base: ' + commission.base + '€, IVA: ' + commission.iva + '€, Total: ' + commission.total + '€');
  } catch (e) {
    Logger.log('✗ Error enviando email: ' + e.message);
  }

  Logger.log('═══════════════════════════════════════');
}

/**
 * Helper: Crear pestañas programáticamente (alternativa a creación manual)
 */
function createAgent6Sheets() {
  var ss = SpreadsheetApp.openById(COL_CONFIG.SPREADSHEET_ID);

  // Collection_Queue
  var colSheet = ss.getSheetByName(COL_CONFIG.SHEETS.COLLECTION_QUEUE);
  if (!colSheet) {
    colSheet = ss.insertSheet(COL_CONFIG.SHEETS.COLLECTION_QUEUE);
    var headers = [
      'case_id', 'created_at', 'source_agent', 'source_status',
      'passenger_name', 'passenger_email', 'passenger_phone',
      'airline_name', 'flight_number', 'flight_date', 'incident_type',
      'compensation_eur', 'resolution_type', 'resolution_date', 'resolution_reference',
      'payment_deadline', 'instructions_sent_date', 'passenger_confirmed_payment',
      'payment_confirmed_date', 'commission_amount', 'commission_invoice_sent',
      'commission_invoice_date', 'commission_paid', 'status', 'status_updated_at'
    ];
    colSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    Logger.log('✓ Collection_Queue creada con ' + headers.length + ' columnas');
  } else {
    Logger.log('Collection_Queue ya existe');
  }

  // Agent6_Log
  var logSheet = ss.getSheetByName(COL_CONFIG.SHEETS.LOG);
  if (!logSheet) {
    logSheet = ss.insertSheet(COL_CONFIG.SHEETS.LOG);
    logSheet.getRange(1, 1, 1, 5).setValues([['timestamp', 'case_id', 'action', 'details', 'user']]);
    Logger.log('✓ Agent6_Log creada');
  } else {
    Logger.log('Agent6_Log ya existe');
  }
}
