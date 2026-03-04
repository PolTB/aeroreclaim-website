/* flight-data.js — AeroReclaim Pre-Validador AI
   Base de datos de aerolíneas y aeropuertos para validación CE 261/2004 */

var AERORECLAIM = AERORECLAIM || {};

// ===== AEROLÍNEAS (código IATA 2 letras) =====
AERORECLAIM.airlines = {
  // España
  "IB": { name: "Iberia", country: "ES", eu: true },
  "UX": { name: "Air Europa", country: "ES", eu: true },
  "VY": { name: "Vueling", country: "ES", eu: true },
  "I2": { name: "Iberia Express", country: "ES", eu: true },
  "YW": { name: "Air Nostrum", country: "ES", eu: true },
  "EB": { name: "Wamos Air", country: "ES", eu: true },
  // Alemania
  "LH": { name: "Lufthansa", country: "DE", eu: true },
  "EW": { name: "Eurowings", country: "DE", eu: true },
  "DE": { name: "Condor", country: "DE", eu: true },
  "X3": { name: "TUI fly Deutschland", country: "DE", eu: true },
  "4Y": { name: "Discover Airlines", country: "DE", eu: true },
  // Francia
  "AF": { name: "Air France", country: "FR", eu: true },
  "TO": { name: "Transavia France", country: "FR", eu: true },
  "SS": { name: "Corsair", country: "FR", eu: true },
  "A5": { name: "HOP!", country: "FR", eu: true },
  // Italia
  "AZ": { name: "ITA Airways", country: "IT", eu: true },
  "FR": { name: "Ryanair", country: "IE", eu: true },
  "V7": { name: "Volotea", country: "IT", eu: true },
  "NO": { name: "Neos", country: "IT", eu: true },
  // Reino Unido (post-Brexit: aplica CE 261 si sale de aeropuerto EU)
  "BA": { name: "British Airways", country: "GB", eu: false },
  "U2": { name: "easyJet", country: "GB", eu: false },
  "LS": { name: "Jet2", country: "GB", eu: false },
  "TOM": { name: "TUI Airways", country: "GB", eu: false },
  "BY": { name: "TUI Airways", country: "GB", eu: false },
  "ZT": { name: "Titan Airways", country: "GB", eu: false },
  // Países Bajos
  "KL": { name: "KLM", country: "NL", eu: true },
  "HV": { name: "Transavia", country: "NL", eu: true },
  // Portugal
  "TP": { name: "TAP Air Portugal", country: "PT", eu: true },
  // Irlanda
  "EI": { name: "Aer Lingus", country: "IE", eu: true },
  // Suiza (aplica reglas similares EU)
  "LX": { name: "Swiss", country: "CH", eu: true },
  // Austria
  "OS": { name: "Austrian Airlines", country: "AT", eu: true },
  // Bélgica
  "SN": { name: "Brussels Airlines", country: "BE", eu: true },
  // Escandinavia
  "SK": { name: "SAS", country: "SE", eu: true },
  "DY": { name: "Norwegian", country: "NO", eu: true },
  "D8": { name: "Norwegian Air Sweden", country: "SE", eu: true },
  "AY": { name: "Finnair", country: "FI", eu: true },
  "RC": { name: "Atlantic Airways", country: "DK", eu: true },
  // Europa del Este
  "OK": { name: "Czech Airlines", country: "CZ", eu: true },
  "LO": { name: "LOT Polish", country: "PL", eu: true },
  "W6": { name: "Wizz Air", country: "HU", eu: true },
  "RO": { name: "TAROM", country: "RO", eu: true },
  "BT": { name: "airBaltic", country: "LV", eu: true },
  "JU": { name: "Air Serbia", country: "RS", eu: false },
  "OU": { name: "Croatia Airlines", country: "HR", eu: true },
  "JP": { name: "Adria Airways", country: "SI", eu: true },
  "FB": { name: "Bulgaria Air", country: "BG", eu: true },
  // Grecia / Chipre / Malta
  "A3": { name: "Aegean Airlines", country: "GR", eu: true },
  "OA": { name: "Olympic Air", country: "GR", eu: true },
  "CY": { name: "Cyprus Airways", country: "CY", eu: true },
  "KM": { name: "Air Malta", country: "MT", eu: true },
  // Turquía
  "TK": { name: "Turkish Airlines", country: "TR", eu: false },
  "PC": { name: "Pegasus Airlines", country: "TR", eu: false },
  "XQ": { name: "SunExpress", country: "TR", eu: false },
  // Oriente Medio
  "EK": { name: "Emirates", country: "AE", eu: false },
  "QR": { name: "Qatar Airways", country: "QA", eu: false },
  "EY": { name: "Etihad Airways", country: "AE", eu: false },
  "GF": { name: "Gulf Air", country: "BH", eu: false },
  "SV": { name: "Saudia", country: "SA", eu: false },
  "RJ": { name: "Royal Jordanian", country: "JO", eu: false },
  // África
  "AT": { name: "Royal Air Maroc", country: "MA", eu: false },
  "MS": { name: "EgyptAir", country: "EG", eu: false },
  "ET": { name: "Ethiopian Airlines", country: "ET", eu: false },
  // América
  "AA": { name: "American Airlines", country: "US", eu: false },
  "UA": { name: "United Airlines", country: "US", eu: false },
  "DL": { name: "Delta Air Lines", country: "US", eu: false },
  "AC": { name: "Air Canada", country: "CA", eu: false },
  "LA": { name: "LATAM Airlines", country: "CL", eu: false },
  "AV": { name: "Avianca", country: "CO", eu: false },
  "AM": { name: "Aeroméxico", country: "MX", eu: false },
  "CM": { name: "Copa Airlines", country: "PA", eu: false },
  // Asia
  "SQ": { name: "Singapore Airlines", country: "SG", eu: false },
  "CX": { name: "Cathay Pacific", country: "HK", eu: false },
  "NH": { name: "ANA", country: "JP", eu: false },
  "JL": { name: "Japan Airlines", country: "JP", eu: false },
  "CZ": { name: "China Southern", country: "CN", eu: false },
  "CA": { name: "Air China", country: "CN", eu: false },
  "KE": { name: "Korean Air", country: "KR", eu: false },
  "OZ": { name: "Asiana Airlines", country: "KR", eu: false },
  "AI": { name: "Air India", country: "IN", eu: false },
  "TG": { name: "Thai Airways", country: "TH", eu: false },
  "MH": { name: "Malaysia Airlines", country: "MY", eu: false },
  // Low-cost misc
  "W4": { name: "Wizzair Malta", country: "MT", eu: true },
  "QS": { name: "SmartWings", country: "CZ", eu: true },
  "5O": { name: "ASL Airlines France", country: "FR", eu: true },
  "PC": { name: "Pegasus Airlines", country: "TR", eu: false }
};

// ===== AEROPUERTOS (top 120+ con coordenadas) =====
AERORECLAIM.airports = {
  // ESPAÑA
  "MAD": { city: "Madrid", name: "Adolfo Suárez Madrid-Barajas", country: "ES", eu: true, lat: 40.4719, lon: -3.5626 },
  "BCN": { city: "Barcelona", name: "El Prat", country: "ES", eu: true, lat: 41.2971, lon: 2.0785 },
  "PMI": { city: "Palma de Mallorca", name: "Son Sant Joan", country: "ES", eu: true, lat: 39.5517, lon: 2.7388 },
  "AGP": { city: "Málaga", name: "Costa del Sol", country: "ES", eu: true, lat: 36.6749, lon: -4.4991 },
  "ALC": { city: "Alicante", name: "Alicante-Elche", country: "ES", eu: true, lat: 38.2822, lon: -0.5582 },
  "TFS": { city: "Tenerife Sur", name: "Tenerife Sur", country: "ES", eu: true, lat: 28.0445, lon: -16.5725 },
  "LPA": { city: "Las Palmas", name: "Gran Canaria", country: "ES", eu: true, lat: 27.9319, lon: -15.3866 },
  "TFN": { city: "Tenerife Norte", name: "Los Rodeos", country: "ES", eu: true, lat: 28.4827, lon: -16.3415 },
  "ACE": { city: "Lanzarote", name: "César Manrique", country: "ES", eu: true, lat: 28.9455, lon: -13.6052 },
  "FUE": { city: "Fuerteventura", name: "Fuerteventura", country: "ES", eu: true, lat: 28.4527, lon: -13.8638 },
  "SVQ": { city: "Sevilla", name: "San Pablo", country: "ES", eu: true, lat: 37.4180, lon: -5.8931 },
  "BIO": { city: "Bilbao", name: "Bilbao", country: "ES", eu: true, lat: 43.3011, lon: -2.9106 },
  "VLC": { city: "Valencia", name: "Valencia", country: "ES", eu: true, lat: 39.4894, lon: -0.4816 },
  "SCQ": { city: "Santiago", name: "Santiago de Compostela", country: "ES", eu: true, lat: 42.8963, lon: -8.4152 },
  "IBZ": { city: "Ibiza", name: "Ibiza", country: "ES", eu: true, lat: 38.8729, lon: 1.3731 },
  "MAH": { city: "Menorca", name: "Menorca", country: "ES", eu: true, lat: 39.8626, lon: 4.2186 },
  "GRO": { city: "Girona", name: "Girona-Costa Brava", country: "ES", eu: true, lat: 41.9010, lon: 2.7605 },
  "REU": { city: "Reus", name: "Reus", country: "ES", eu: true, lat: 41.1474, lon: 1.1672 },
  "ZAZ": { city: "Zaragoza", name: "Zaragoza", country: "ES", eu: true, lat: 41.6662, lon: -1.0416 },
  "OVD": { city: "Asturias", name: "Asturias", country: "ES", eu: true, lat: 43.5636, lon: -6.0346 },
  "SDR": { city: "Santander", name: "Santander", country: "ES", eu: true, lat: 43.4271, lon: -3.8200 },
  "MJV": { city: "Murcia", name: "Región de Murcia", country: "ES", eu: true, lat: 37.7750, lon: -0.8125 },

  // FRANCIA
  "CDG": { city: "París", name: "Charles de Gaulle", country: "FR", eu: true, lat: 49.0097, lon: 2.5479 },
  "ORY": { city: "París", name: "Orly", country: "FR", eu: true, lat: 48.7233, lon: 2.3794 },
  "NCE": { city: "Niza", name: "Côte d'Azur", country: "FR", eu: true, lat: 43.6584, lon: 7.2159 },
  "LYS": { city: "Lyon", name: "Saint-Exupéry", country: "FR", eu: true, lat: 45.7256, lon: 5.0811 },
  "MRS": { city: "Marsella", name: "Provence", country: "FR", eu: true, lat: 43.4393, lon: 5.2214 },
  "TLS": { city: "Toulouse", name: "Blagnac", country: "FR", eu: true, lat: 43.6291, lon: 1.3638 },
  "BOD": { city: "Burdeos", name: "Mérignac", country: "FR", eu: true, lat: 44.8283, lon: -0.7156 },
  "NTE": { city: "Nantes", name: "Atlantique", country: "FR", eu: true, lat: 47.1532, lon: -1.6108 },

  // ALEMANIA
  "FRA": { city: "Frankfurt", name: "Frankfurt", country: "DE", eu: true, lat: 50.0379, lon: 8.5622 },
  "MUC": { city: "Múnich", name: "Franz Josef Strauss", country: "DE", eu: true, lat: 48.3538, lon: 11.7861 },
  "BER": { city: "Berlín", name: "Brandenburg", country: "DE", eu: true, lat: 52.3667, lon: 13.5033 },
  "DUS": { city: "Düsseldorf", name: "Düsseldorf", country: "DE", eu: true, lat: 51.2895, lon: 6.7668 },
  "HAM": { city: "Hamburgo", name: "Hamburg", country: "DE", eu: true, lat: 53.6304, lon: 10.0063 },
  "STR": { city: "Stuttgart", name: "Stuttgart", country: "DE", eu: true, lat: 48.6899, lon: 9.2220 },
  "CGN": { city: "Colonia", name: "Köln/Bonn", country: "DE", eu: true, lat: 50.8659, lon: 7.1427 },

  // REINO UNIDO
  "LHR": { city: "Londres", name: "Heathrow", country: "GB", eu: false, lat: 51.4700, lon: -0.4543 },
  "LGW": { city: "Londres", name: "Gatwick", country: "GB", eu: false, lat: 51.1537, lon: -0.1821 },
  "STN": { city: "Londres", name: "Stansted", country: "GB", eu: false, lat: 51.8850, lon: 0.2350 },
  "LTN": { city: "Londres", name: "Luton", country: "GB", eu: false, lat: 51.8747, lon: -0.3683 },
  "MAN": { city: "Manchester", name: "Manchester", country: "GB", eu: false, lat: 53.3537, lon: -2.2750 },
  "EDI": { city: "Edimburgo", name: "Edinburgh", country: "GB", eu: false, lat: 55.9508, lon: -3.3725 },
  "BHX": { city: "Birmingham", name: "Birmingham", country: "GB", eu: false, lat: 52.4539, lon: -1.7480 },
  "BRS": { city: "Bristol", name: "Bristol", country: "GB", eu: false, lat: 51.3827, lon: -2.7191 },

  // ITALIA
  "FCO": { city: "Roma", name: "Fiumicino", country: "IT", eu: true, lat: 41.7999, lon: 12.2462 },
  "MXP": { city: "Milán", name: "Malpensa", country: "IT", eu: true, lat: 45.6306, lon: 8.7281 },
  "LIN": { city: "Milán", name: "Linate", country: "IT", eu: true, lat: 45.4495, lon: 9.2783 },
  "NAP": { city: "Nápoles", name: "Capodichino", country: "IT", eu: true, lat: 40.8860, lon: 14.2908 },
  "VCE": { city: "Venecia", name: "Marco Polo", country: "IT", eu: true, lat: 45.5053, lon: 12.3519 },
  "BGY": { city: "Bérgamo", name: "Orio al Serio", country: "IT", eu: true, lat: 45.6739, lon: 9.7042 },
  "BLQ": { city: "Bolonia", name: "Guglielmo Marconi", country: "IT", eu: true, lat: 44.5354, lon: 11.2887 },
  "PSA": { city: "Pisa", name: "Galileo Galilei", country: "IT", eu: true, lat: 43.6839, lon: 10.3927 },
  "CTA": { city: "Catania", name: "Fontanarossa", country: "IT", eu: true, lat: 37.4668, lon: 15.0664 },
  "PMO": { city: "Palermo", name: "Falcone-Borsellino", country: "IT", eu: true, lat: 38.1760, lon: 13.0909 },

  // PORTUGAL
  "LIS": { city: "Lisboa", name: "Humberto Delgado", country: "PT", eu: true, lat: 38.7756, lon: -9.1354 },
  "OPO": { city: "Oporto", name: "Francisco Sá Carneiro", country: "PT", eu: true, lat: 41.2481, lon: -8.6814 },
  "FAO": { city: "Faro", name: "Faro", country: "PT", eu: true, lat: 37.0144, lon: -7.9659 },
  "FNC": { city: "Funchal", name: "Madeira", country: "PT", eu: true, lat: 32.6942, lon: -16.7745 },

  // PAÍSES BAJOS
  "AMS": { city: "Ámsterdam", name: "Schiphol", country: "NL", eu: true, lat: 52.3086, lon: 4.7639 },
  "EIN": { city: "Eindhoven", name: "Eindhoven", country: "NL", eu: true, lat: 51.4501, lon: 5.3745 },

  // BÉLGICA
  "BRU": { city: "Bruselas", name: "Brussels", country: "BE", eu: true, lat: 50.9014, lon: 4.4844 },
  "CRL": { city: "Bruselas", name: "Charleroi", country: "BE", eu: true, lat: 50.4592, lon: 4.4538 },

  // SUIZA
  "ZRH": { city: "Zúrich", name: "Zürich", country: "CH", eu: true, lat: 47.4647, lon: 8.5492 },
  "GVA": { city: "Ginebra", name: "Genève", country: "CH", eu: true, lat: 46.2381, lon: 6.1089 },
  "BSL": { city: "Basilea", name: "EuroAirport", country: "CH", eu: true, lat: 47.5896, lon: 7.5299 },

  // AUSTRIA
  "VIE": { city: "Viena", name: "Vienna", country: "AT", eu: true, lat: 48.1103, lon: 16.5697 },
  "SZG": { city: "Salzburgo", name: "Salzburg", country: "AT", eu: true, lat: 47.7933, lon: 13.0043 },

  // ESCANDINAVIA
  "CPH": { city: "Copenhague", name: "Kastrup", country: "DK", eu: true, lat: 55.6180, lon: 12.6508 },
  "ARN": { city: "Estocolmo", name: "Arlanda", country: "SE", eu: true, lat: 59.6519, lon: 17.9186 },
  "OSL": { city: "Oslo", name: "Gardermoen", country: "NO", eu: true, lat: 60.1976, lon: 11.1004 },
  "HEL": { city: "Helsinki", name: "Vantaa", country: "FI", eu: true, lat: 60.3172, lon: 24.9633 },
  "BGO": { city: "Bergen", name: "Flesland", country: "NO", eu: true, lat: 60.2934, lon: 5.2181 },

  // EUROPA DEL ESTE
  "WAW": { city: "Varsovia", name: "Chopin", country: "PL", eu: true, lat: 52.1657, lon: 20.9671 },
  "PRG": { city: "Praga", name: "Václav Havel", country: "CZ", eu: true, lat: 50.1008, lon: 14.2600 },
  "BUD": { city: "Budapest", name: "Ferenc Liszt", country: "HU", eu: true, lat: 47.4298, lon: 19.2611 },
  "OTP": { city: "Bucarest", name: "Henri Coandă", country: "RO", eu: true, lat: 44.5711, lon: 26.0850 },
  "SOF": { city: "Sofía", name: "Sofia", country: "BG", eu: true, lat: 42.6952, lon: 23.4062 },
  "ZAG": { city: "Zagreb", name: "Franjo Tuđman", country: "HR", eu: true, lat: 45.7429, lon: 16.0688 },
  "KRK": { city: "Cracovia", name: "Balice", country: "PL", eu: true, lat: 50.0777, lon: 19.7848 },

  // GRECIA
  "ATH": { city: "Atenas", name: "Eleftherios Venizelos", country: "GR", eu: true, lat: 37.9364, lon: 23.9445 },
  "SKG": { city: "Salónica", name: "Makedonia", country: "GR", eu: true, lat: 40.5197, lon: 22.9709 },
  "HER": { city: "Heraklion", name: "Heraklion", country: "GR", eu: true, lat: 35.3397, lon: 25.1803 },
  "RHO": { city: "Rodas", name: "Diagoras", country: "GR", eu: true, lat: 36.4054, lon: 28.0862 },
  "CFU": { city: "Corfú", name: "Ioannis Kapodistrias", country: "GR", eu: true, lat: 39.6019, lon: 19.9117 },

  // TURQUÍA
  "IST": { city: "Estambul", name: "Istanbul Airport", country: "TR", eu: false, lat: 41.2753, lon: 28.7519 },
  "SAW": { city: "Estambul", name: "Sabiha Gökçen", country: "TR", eu: false, lat: 40.8986, lon: 29.3092 },
  "AYT": { city: "Antalya", name: "Antalya", country: "TR", eu: false, lat: 36.8987, lon: 30.8005 },
  "ADB": { city: "Izmir", name: "Adnan Menderes", country: "TR", eu: false, lat: 38.2924, lon: 27.1570 },

  // MARRUECOS
  "CMN": { city: "Casablanca", name: "Mohammed V", country: "MA", eu: false, lat: 33.3675, lon: -7.5900 },
  "RAK": { city: "Marrakech", name: "Menara", country: "MA", eu: false, lat: 31.6069, lon: -8.0363 },

  // INTERNACIONAL
  "JFK": { city: "Nueva York", name: "John F. Kennedy", country: "US", eu: false, lat: 40.6413, lon: -73.7781 },
  "EWR": { city: "Nueva York", name: "Newark", country: "US", eu: false, lat: 40.6895, lon: -74.1745 },
  "MIA": { city: "Miami", name: "Miami", country: "US", eu: false, lat: 25.7959, lon: -80.2870 },
  "LAX": { city: "Los Ángeles", name: "Los Angeles", country: "US", eu: false, lat: 33.9425, lon: -118.4081 },
  "ORD": { city: "Chicago", name: "O'Hare", country: "US", eu: false, lat: 41.9742, lon: -87.9073 },
  "SFO": { city: "San Francisco", name: "San Francisco", country: "US", eu: false, lat: 37.6213, lon: -122.3790 },
  "YYZ": { city: "Toronto", name: "Pearson", country: "CA", eu: false, lat: 43.6777, lon: -79.6248 },
  "BOG": { city: "Bogotá", name: "El Dorado", country: "CO", eu: false, lat: 4.7016, lon: -74.1469 },
  "MEX": { city: "Ciudad de México", name: "Benito Juárez", country: "MX", eu: false, lat: 19.4363, lon: -99.0721 },
  "GRU": { city: "São Paulo", name: "Guarulhos", country: "BR", eu: false, lat: -23.4356, lon: -46.4731 },
  "EZE": { city: "Buenos Aires", name: "Ezeiza", country: "AR", eu: false, lat: -34.8222, lon: -58.5358 },
  "DXB": { city: "Dubái", name: "Dubai International", country: "AE", eu: false, lat: 25.2532, lon: 55.3657 },
  "DOH": { city: "Doha", name: "Hamad International", country: "QA", eu: false, lat: 25.2731, lon: 51.6081 },
  "SIN": { city: "Singapur", name: "Changi", country: "SG", eu: false, lat: 1.3644, lon: 103.9915 },
  "NRT": { city: "Tokio", name: "Narita", country: "JP", eu: false, lat: 35.7647, lon: 140.3864 },
  "HND": { city: "Tokio", name: "Haneda", country: "JP", eu: false, lat: 35.5494, lon: 139.7798 },
  "PEK": { city: "Pekín", name: "Capital", country: "CN", eu: false, lat: 40.0799, lon: 116.6031 },
  "BKK": { city: "Bangkok", name: "Suvarnabhumi", country: "TH", eu: false, lat: 13.6900, lon: 100.7501 },
  "ICN": { city: "Seúl", name: "Incheon", country: "KR", eu: false, lat: 37.4602, lon: 126.4407 },
  "DEL": { city: "Nueva Delhi", name: "Indira Gandhi", country: "IN", eu: false, lat: 28.5562, lon: 77.1000 },
  "CAI": { city: "El Cairo", name: "Cairo", country: "EG", eu: false, lat: 30.1219, lon: 31.4056 },
  "ADD": { city: "Addis Abeba", name: "Bole", country: "ET", eu: false, lat: 8.9779, lon: 38.7993 },
  "JNB": { city: "Johannesburgo", name: "O.R. Tambo", country: "ZA", eu: false, lat: -26.1392, lon: 28.2460 },
  "SYD": { city: "Sídney", name: "Kingsford Smith", country: "AU", eu: false, lat: -33.9461, lon: 151.1772 },

  // IRLANDA
  "DUB": { city: "Dublín", name: "Dublin Airport", country: "IE", eu: true, lat: 53.4264, lon: -6.2499 },

  // MALTA / CHIPRE
  "MLA": { city: "La Valeta", name: "Malta International", country: "MT", eu: true, lat: 35.8575, lon: 14.4775 },
  "LCA": { city: "Larnaca", name: "Larnaca", country: "CY", eu: true, lat: 34.8754, lon: 33.6249 },

  // LUXEMBURGO
  "LUX": { city: "Luxemburgo", name: "Luxembourg", country: "LU", eu: true, lat: 49.6233, lon: 6.2044 },

  // ISLANDIA
  "KEF": { city: "Reikiavik", name: "Keflavik", country: "IS", eu: true, lat: 63.9850, lon: -22.6056 }
};

// ===== RUTAS CONOCIDAS DE AEROLÍNEAS ESPAÑOLAS =====
// Mapeo parcial: código de vuelo prefix → rutas frecuentes
// Se usa para sugerir ruta cuando no tenemos datos reales del vuelo
AERORECLAIM.knownRoutes = {
  "IB": {
    hubs: ["MAD"],
    commonDest: ["BCN", "LHR", "CDG", "FCO", "MXP", "LIS", "JFK", "MIA", "BOG", "MEX", "GRU", "EZE", "PMI", "AMS", "FRA"]
  },
  "VY": {
    hubs: ["BCN", "MAD"],
    commonDest: ["PMI", "ALC", "AGP", "FCO", "CDG", "ORY", "LGW", "AMS", "BER", "LIS", "ATH", "NAP"]
  },
  "FR": {
    hubs: ["DUB", "STN", "BGY", "MAD"],
    commonDest: ["BCN", "PMI", "AGP", "ALC", "TFS", "LPA", "SVQ", "BIO", "VLC", "MRS", "BER", "WAW"]
  },
  "UX": {
    hubs: ["MAD"],
    commonDest: ["PMI", "BCN", "TFS", "LPA", "CDG", "FCO", "LIS", "MIA", "BOG", "CUN"]
  },
  "U2": {
    hubs: ["LGW", "LTN", "BRS"],
    commonDest: ["BCN", "PMI", "AGP", "ALC", "TFS", "FUE", "NCE", "CDG", "AMS", "GVA"]
  },
  "W6": {
    hubs: ["BUD", "WAW", "OTP"],
    commonDest: ["BCN", "LTN", "BGY", "FCO", "BER", "DUS"]
  }
};
