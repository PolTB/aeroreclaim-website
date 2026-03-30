/* validator.js — AeroReclaim Pre-Validador AI
   Motor de validación CE 261/2004 client-side */

var AERORECLAIM = AERORECLAIM || {};

(function() {
  'use strict';

  // ===== HAVERSINE DISTANCE =====
  function haversine(lat1, lon1, lat2, lon2) {
    var R = 6371; // km
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ===== CE 261/2004 COMPENSATION =====
  function getCompensation(distanceKm) {
    if (distanceKm <= 1500) return 250;
    if (distanceKm <= 3500) return 400;
    return 600;
  }

  function getDistanceBand(distanceKm) {
    if (distanceKm <= 1500) return 'short';
    if (distanceKm <= 3500) return 'medium';
    return 'long';
  }

  // ===== PARSE FLIGHT NUMBER =====
  function parseFlightNumber(raw) {
    var cleaned = raw.trim().toUpperCase().replace(/\s+/g, '');
    // Match: 2 letters + 1-4 digits
    var match = cleaned.match(/^([A-Z]{2})(\d{1,4})$/);
    if (!match) {
      // Try 3-letter code (some airlines like TOM)
      match = cleaned.match(/^([A-Z]{2,3})(\d{1,4})$/);
    }
    if (!match) return null;
    return {
      airline: match[1],
      number: match[2],
      full: match[1] + match[2]
    };
  }

  // ===== DATE VALIDATION =====
  function validateDate(dateStr) {
    if (!dateStr) return { valid: false, reason: 'no_date' };
    var date = new Date(dateStr + 'T00:00:00');
    var now = new Date();
    now.setHours(0, 0, 0, 0);

    if (isNaN(date.getTime())) return { valid: false, reason: 'invalid' };
    if (date > now) return { valid: false, reason: 'future' };

    // 5-year prescription in Spain
    var fiveYearsAgo = new Date(now);
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    if (date < fiveYearsAgo) return { valid: false, reason: 'expired' };

    return {
      valid: true,
      date: date,
      daysAgo: Math.floor((now - date) / (1000 * 60 * 60 * 24)),
      withinYear: (now - date) < (365.25 * 24 * 60 * 60 * 1000)
    };
  }

  // ===== FIND LIKELY ROUTE =====
  // Given an airline code, estimate a likely route (hub → common dest)
  // This is used when we don't have real flight data
  function estimateRoute(airlineCode) {
    var routes = AERORECLAIM.knownRoutes[airlineCode];
    if (!routes) return null;
    // Return hub as origin
    return {
      origin: routes.hubs[0],
      possibleDests: routes.commonDest
    };
  }

  // ===== ESTIMATE DISTANCE RANGE FOR AIRLINE =====
  function estimateDistanceRange(airlineCode) {
    var airports = AERORECLAIM.airports;
    var routes = AERORECLAIM.knownRoutes[airlineCode];
    if (!routes || !routes.hubs[0]) return null;

    var hub = airports[routes.hubs[0]];
    if (!hub) return null;

    var distances = [];
    routes.commonDest.forEach(function(dest) {
      var ap = airports[dest];
      if (ap) {
        distances.push(haversine(hub.lat, hub.lon, ap.lat, ap.lon));
      }
    });

    if (distances.length === 0) return null;
    distances.sort(function(a, b) { return a - b; });

    return {
      min: Math.round(distances[0]),
      max: Math.round(distances[distances.length - 1]),
      median: Math.round(distances[Math.floor(distances.length / 2)]),
      count: distances.length
    };
  }


     // ===== CALCULATE ROUTE DISTANCE (FIX: fallback intercontinental) =====
  function calculateRouteDistance(origin, destination) {
    var originAirport      = AERORECLAIM.airports[origin];
    var destinationAirport = AERORECLAIM.airports[destination];

    var distance;
    if (!originAirport || !destinationAirport) {
      // Fallback: aeropuerto no en DB -> asumir intercontinental -> 600EUR
      distance = 4000;
      console.warn('[AeroReclaim] Aeropuerto no encontrado:', !originAirport ? origin : destination);
    } else {
      distance = haversine(
        originAirport.lat, originAirport.lon,
        destinationAirport.lat, destinationAirport.lon
      );
    }
    return distance;
  }
  // ===== MAIN VALIDATION FUNCTION =====
  AERORECLAIM.validate = function(flightNumber, dateStr) {
    var result = {
      status: 'unknown', // eligible, likely_eligible, needs_info, not_eligible
      flightParsed: null,
      airline: null,
      dateInfo: null,
      route: null,
      distance: null,
      compensation: null,
      confidence: 'low',
      reasons: [],
      errors: []
    };

    // 1. Parse flight number
    var parsed = parseFlightNumber(flightNumber);
    if (!parsed) {
      result.status = 'error';
      result.errors.push('invalid_flight');
      return result;
    }
    result.flightParsed = parsed;

    // 2. Find airline
    var airline = AERORECLAIM.airlines[parsed.airline];
    if (airline) {
      result.airline = {
        code: parsed.airline,
        name: airline.name,
        country: airline.country,
        isEU: airline.eu
      };
    } else {
      result.airline = {
        code: parsed.airline,
        name: 'Aerolínea ' + parsed.airline,
        country: null,
        isEU: null
      };
      result.reasons.push('airline_unknown');
    }

    // 3. Validate date
    var dateInfo = validateDate(dateStr);
    result.dateInfo = dateInfo;
    if (!dateInfo.valid) {
      result.status = 'error';
      result.errors.push('date_' + dateInfo.reason);
      return result;
    }

    // 4. Check EU applicability
    var isEUAirline = result.airline.isEU === true;
    // We can't know the departure airport without real API data,
    // but we can make educated guesses based on airline hub

    // 5. Estimate distance range
    var routeInfo = estimateRoute(parsed.airline);
    var distanceRange = estimateDistanceRange(parsed.airline);

    if (routeInfo) {
      var originAirport = AERORECLAIM.airports[routeInfo.origin];
      result.route = {
        origin: routeInfo.origin,
        originCity: originAirport ? originAirport.city : routeInfo.origin,
        originCountry: originAirport ? originAirport.country : null,
        isOriginEU: originAirport ? originAirport.eu : null
      };
    }

    if (distanceRange) {
      result.distance = distanceRange;
    }

    // 6. Determine eligibility
    if (isEUAirline) {
      // EU airline → CE 261 applies regardless of route
      result.status = 'likely_eligible';
      result.confidence = 'high';
      result.reasons.push('eu_airline');

      if (distanceRange) {
        // Calculate min/max compensation
        var minComp = getCompensation(distanceRange.min);
        var maxComp = getCompensation(distanceRange.max);
        var medComp = getCompensation(distanceRange.median);
        result.compensation = {
          min: minComp,
          max: maxComp,
          estimated: medComp,
          band: getDistanceBand(distanceRange.median)
        };
      } else {
        // EU airline but unknown routes → assume 250-600 range
        result.compensation = {
          min: 250,
          max: 600,
          estimated: 400,
          band: 'medium'
        };
      }
    } else if (result.airline.isEU === false) {
      // Non-EU airline → only applies if departure from EU airport
      // We assume likely since user is on a Spanish site
      result.status = 'likely_eligible';
      result.confidence = 'medium';
      result.reasons.push('non_eu_airline_but_likely_eu_departure');

      if (distanceRange) {
        result.compensation = {
          min: getCompensation(distanceRange.min),
          max: getCompensation(distanceRange.max),
          estimated: getCompensation(distanceRange.median),
          band: getDistanceBand(distanceRange.median)
        };
      } else {
        result.compensation = {
          min: 250,
          max: 600,
          estimated: 400,
          band: 'medium'
        };
      }
    } else {
      // Unknown airline → still possible
      result.status = 'likely_eligible';
      result.confidence = 'low';
      result.reasons.push('need_more_info');
      result.compensation = {
        min: 250,
        max: 600,
        estimated: 400,
        band: 'medium'
      };
    }

    // 7. Date-based modifiers
    if (dateInfo.daysAgo > 1460) { // ~4 years
      result.reasons.push('close_to_expiry');
    }

    if (dateInfo.withinYear) {
      result.reasons.push('recent_flight');
      if (result.confidence === 'high') {
        result.confidence = 'very_high';
      }
    }

    return result;
  };

  // ===== FORMAT HELPERS =====
  AERORECLAIM.formatDate = function(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    var months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return d.getDate() + ' de ' + months[d.getMonth()] + ' de ' + d.getFullYear();
  };

  AERORECLAIM.formatCompensation = function(amount) {
    return amount.toLocaleString('es-ES') + '€';
  };

})();
