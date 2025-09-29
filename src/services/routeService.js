/**
 * Tjänst för ruttplanering med OpenRouteService API för gångvägar och stigar.
 */

// OpenRouteService är gratis men kräver registrering för API-nyckel
const ORS_API_KEY = process.env.REACT_APP_OPENROUTE_API_KEY || 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImEzN2RiYzM2MjdlZDRjMzVhNjE4MTI3ZTU2MTcwMjVjIiwiaCI6Im11cm11cjY0In0=';
const ORS_BASE_URL = 'https://api.openrouteservice.org/v2';

// Debug API-nyckel
if (process.env.NODE_ENV !== 'production') {
  console.debug('[RouteService] API-nyckel status:', {
    hasKey: !!ORS_API_KEY,
    keyLength: ORS_API_KEY?.length || 0,
    keyPreview: ORS_API_KEY ? ORS_API_KEY.substring(0, 20) + '...' : 'undefined',
    allEnvKeys: Object.keys(process.env).filter(key => key.includes('OPENROUTE')),
    directCheck: process.env.REACT_APP_OPENROUTE_API_KEY?.substring(0, 20) + '...'
  });
}

/**
 * Dekoderar polyline-geometri från OpenRouteService till koordinater.
 * Baserat på Google's polyline algorithm.
 */
const decodePolyline = (encoded) => {
  const coordinates = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;

    // Dekoda latitud
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    shift = 0;
    result = 0;

    // Dekoda longitud
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    coordinates.push({
      lat: lat / 1e5,
      lng: lng / 1e5
    });
  }

  return coordinates;
};

/**
 * Skapar en cirkulär gångrutt med riktiga vägar mellan punkter.
 */
export const generateWalkingRoute = async ({ origin, lengthMeters, checkpointCount }) => {
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[RouteService] generateWalkingRoute startar:', {
      origin,
      lengthMeters,
      checkpointCount,
      hasApiKey: !!ORS_API_KEY
    });
  }

  // Fallback till befintlig implementering om API-nyckel saknas
  if (!ORS_API_KEY) {
    console.warn('[RouteService] OpenRouteService API-nyckel saknas, använder cirkulär approximation');
    const fallbackResult = generateCircularRoute({ origin, lengthMeters, checkpointCount });
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[RouteService] Fallback-resultat (ingen API-nyckel):', {
        checkpointCount: fallbackResult.checkpoints?.length || 0,
        routePointCount: fallbackResult.route?.length || 0
      });
    }
    return fallbackResult;
  }

  try {
    // Skapa en cirkulär rutt genom att hitta waypoints och sedan planera vägar mellan dem
    const waypoints = generateCircularWaypoints({ origin, lengthMeters, checkpointCount });

    // Optimera API-användning genom att begära hela rutten på en gång
    const completeRoute = [...waypoints, waypoints[0]]; // Stäng cirkeln

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[RouteService] Begär komplett rutt med', completeRoute.length, 'waypoints');
    }

    const routeData = await getCompleteWalkingRoute(completeRoute, lengthMeters);

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[RouteService] API-ruttdata mottagen:', {
        coordinatesLength: routeData.coordinates?.length || 0,
        totalDistance: routeData.totalDistance
      });
    }

    // Placera checkpoints längs den faktiska rutten
    const result = distributeCheckpointsAlongRoute(routeData, checkpointCount);

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[RouteService] Slutligt resultat från API:', {
        checkpointCount: result.checkpoints?.length || 0,
        routePointCount: result.route?.length || 0,
        totalDistance: result.totalDistance
      });
    }

    return result;

  } catch (error) {
    console.warn('[RouteService] Kunde inte hämta ruttdata från OpenRouteService:', error);
    const fallbackResult = generateCircularRoute({ origin, lengthMeters, checkpointCount });
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[RouteService] Fallback-resultat (API-fel):', {
        checkpointCount: fallbackResult.checkpoints?.length || 0,
        routePointCount: fallbackResult.route?.length || 0
      });
    }
    return fallbackResult;
  }
};

/**
 * Hämtar gångdirektioner för en komplett rutt med flera waypoints.
 */
const getCompleteWalkingRoute = async (waypoints, lengthMeters = 2000) => {
  const url = `${ORS_BASE_URL}/directions/foot-walking`;
  const coordinates = waypoints.map(wp => [wp.lng, wp.lat]);

  // Använd OpenRouteService round_trip API för cirkulära rutter
  const body = {
    coordinates: [coordinates[0]], // Bara startpunkten för round_trip
    format: 'json',
    instructions: false,
    geometry: true,
    options: {
      avoid_features: ['ferries'], // Undviker bara färjor - stora vägar är okej för rutten
      round_trip: {
        length: lengthMeters,
        points: Math.min(4, Math.max(2, Math.floor(lengthMeters / 1000))),
        seed: Math.floor(Math.random() * 90)
      }
    }
  };

  if (process.env.NODE_ENV !== 'production') {
    console.debug('[RouteService] Skickar API-förfrågan till:', url);
    console.debug('[RouteService] API-nyckel längd:', ORS_API_KEY?.length || 0);
    console.debug('[RouteService] Waypoints för API:', coordinates.length);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': ORS_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (process.env.NODE_ENV !== 'production') {
    console.debug('[RouteService] API-respons status:', response.status);
  }

  if (!response.ok) {
    const errorText = await response.text();
    if (process.env.NODE_ENV !== 'production') {
      console.error('[RouteService] API-fel respons:', errorText);
    }
    throw new Error(`OpenRouteService API fel: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  if (process.env.NODE_ENV !== 'production') {
    console.debug('[RouteService] API-data mottagen:', {
      hasRoutes: !!data.routes,
      routeCount: data.routes?.length || 0,
      hasFirstRoute: !!data.routes?.[0],
      hasGeometry: !!data.routes?.[0]?.geometry
    });
  }

  const route = data.routes[0];

  // Dekoda geometrin från det kodade formatet
  if (route.geometry) {
    const decodedCoordinates = decodePolyline(route.geometry);

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[RouteService] Dekodad rutt:', {
        originalLength: route.geometry.length,
        decodedPoints: decodedCoordinates.length,
        totalDistance: route.summary?.distance || 0
      });
    }

    return {
      coordinates: decodedCoordinates,
      totalDistance: route.summary?.distance || 0,
      route: decodedCoordinates
    };
  }

  throw new Error('Ingen geometri returnerad från API');
};


/**
 * Genererar waypoints i en konservativ cirkel runt startpunkten.
 * Använder mindre radie för att minska risken att hamna i vatten.
 */
const generateCircularWaypoints = ({ origin, lengthMeters, checkpointCount }) => {
  // Beräkna en konservativ radie - mindre för att hålla sig nära land
  const baseRadius = lengthMeters / (2 * Math.PI * 111000); // Konvertera meter till grader
  const conservativeRadius = Math.min(baseRadius * 0.6, 0.005); // Max 500m radie

  // Använd färre waypoints för att minska komplexiteten
  const waypointCount = Math.max(4, Math.min(8, Math.ceil(lengthMeters / 600)));

  if (process.env.NODE_ENV !== 'production') {
    console.debug('[RouteService] Genererar konservativa waypoints:', {
      lengthMeters,
      baseRadius,
      conservativeRadius,
      waypointCount,
      radiusMeters: conservativeRadius * 111000,
      origin
    });
  }

  const waypoints = [];
  for (let i = 0; i < waypointCount; i++) {
    const angle = (i / waypointCount) * Math.PI * 2;

    // Använd konservativ radie med lite variation
    const radiusVariation = conservativeRadius * (0.8 + Math.random() * 0.4);

    waypoints.push({
      lat: origin.lat + Math.sin(angle) * radiusVariation,
      lng: origin.lng + Math.cos(angle) * radiusVariation
    });
  }

  if (process.env.NODE_ENV !== 'production') {
    console.debug('[RouteService] Genererade waypoints:', waypoints.map((wp, i) =>
      `${i}: ${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)}`
    ));
  }

  return waypoints;
};


/**
 * Justerar en checkpoint-position för att undvika stora vägar.
 * Flyttar punkten en liten bit åt sidan från den ursprungliga positionen.
 */
const adjustCheckpointAwayFromHighways = (originalLocation) => {
  // Skapa en liten offset (cirka 50-100m) åt ett slumpmässigt håll
  const offsetDistance = 0.0005 + Math.random() * 0.0005; // 50-100m i grader
  const angle = Math.random() * Math.PI * 2;

  return {
    lat: originalLocation.lat + Math.sin(angle) * offsetDistance,
    lng: originalLocation.lng + Math.cos(angle) * offsetDistance
  };
};

/**
 * Fördelar checkpoints jämnt längs den faktiska rutten.
 * Justerar checkpoints för att undvika stora vägar.
 */
const distributeCheckpointsAlongRoute = (routeData, checkpointCount) => {
  if (!routeData.coordinates || routeData.coordinates.length === 0) {
    throw new Error('Ingen giltig rutt att placera checkpoints på');
  }

  const checkpoints = [];
  const totalPoints = routeData.coordinates.length;

  if (process.env.NODE_ENV !== 'production') {
    console.debug('[RouteService] Fördelar checkpoints:', {
      totalPoints,
      checkpointCount,
      totalDistance: routeData.totalDistance
    });
  }

  for (let i = 0; i < checkpointCount; i++) {
    const index = Math.floor((i / checkpointCount) * totalPoints);
    const safeIndex = Math.min(index, totalPoints - 1);
    const routeLocation = routeData.coordinates[safeIndex];

    // Justera checkpoint-positionen för att undvika stora vägar
    const adjustedLocation = adjustCheckpointAwayFromHighways(routeLocation);

    checkpoints.push({
      location: adjustedLocation,
      routeIndex: safeIndex,
      order: i + 1,
      originalRouteLocation: routeLocation // Spara original för debugging
    });

    if (process.env.NODE_ENV !== 'production') {
      const distance = Math.sqrt(
        Math.pow((adjustedLocation.lat - routeLocation.lat) * 111000, 2) +
        Math.pow((adjustedLocation.lng - routeLocation.lng) * 111000, 2)
      );
      console.debug(`[RouteService] Checkpoint ${i + 1} justerad ${distance.toFixed(0)}m från rutten`);
    }
  }

  return {
    checkpoints,
    route: routeData.coordinates,
    totalDistance: routeData.totalDistance
  };
};

/**
 * Fallback-funktion som skapar en realistisk rutt som börjar och slutar på samma punkt.
 * Försöker följa gatumönster genom att använda rektangulärt rutnät.
 */
const generateCircularRoute = ({ origin, lengthMeters, checkpointCount }) => {
  const checkpoints = [];
  const route = [];

  // Beräkna lämplig radie för en kvadratisk rutt
  const squareSide = Math.sqrt(lengthMeters) / 111000; // Konvertera till grader
  const maxRadius = Math.min(squareSide, 0.004); // Max 400m från centrum

  if (process.env.NODE_ENV !== 'production') {
    console.debug('[RouteService] Fallback gatumönster-rutt:', {
      lengthMeters,
      squareSide,
      maxRadius,
      radiusMeters: maxRadius * 111000,
      origin
    });
  }

  // Skapa en rektangulär rutt som efterliknar stadsgator
  const cornerOffsets = [
    { lat: -maxRadius/2, lng: -maxRadius/2 }, // Sydväst
    { lat: -maxRadius/2, lng: maxRadius/2 },  // Sydost
    { lat: maxRadius/2, lng: maxRadius/2 },   // Nordost
    { lat: maxRadius/2, lng: -maxRadius/2 },  // Nordväst
    { lat: -maxRadius/2, lng: -maxRadius/2 }  // Tillbaka till start
  ];

  // Skapa rutten genom att interpolera mellan hörnen
  const segmentPoints = Math.max(15, Math.ceil(lengthMeters / 150)); // 1 punkt per 150m

  for (let segment = 0; segment < cornerOffsets.length - 1; segment++) {
    const startCorner = cornerOffsets[segment];
    const endCorner = cornerOffsets[segment + 1];

    for (let i = 0; i < segmentPoints; i++) {
      const progress = i / segmentPoints;

      // Interpolera mellan hörnen
      const lat = origin.lat + startCorner.lat + (endCorner.lat - startCorner.lat) * progress;
      const lng = origin.lng + startCorner.lng + (endCorner.lng - startCorner.lng) * progress;

      // Lägg till lite naturlig variation för att efterlikna gator
      const variation = 0.0002; // Cirka 20m variation
      route.push({
        lat: lat + (Math.random() - 0.5) * variation,
        lng: lng + (Math.random() - 0.5) * variation
      });
    }
  }

  // Se till att rutten slutar exakt där den började
  if (route.length > 0) {
    route.push({ ...route[0] });
  }

  // Placera checkpoints jämnt längs rutten, justerade från vägen
  for (let i = 0; i < checkpointCount; i++) {
    const routeIndex = Math.floor((i / checkpointCount) * (route.length - 1));
    const safeIndex = Math.min(routeIndex, route.length - 1);
    const routeLocation = route[safeIndex];

    // Justera checkpoint-positionen för att undvika stora vägar
    const adjustedLocation = adjustCheckpointAwayFromHighways(routeLocation);

    checkpoints.push({
      location: adjustedLocation,
      routeIndex: safeIndex,
      order: i + 1,
      originalRouteLocation: routeLocation // Spara original för debugging
    });
  }

  if (process.env.NODE_ENV !== 'production') {
    console.debug('[RouteService] Returnerar fallback gatumönster-rutt:', {
      checkpointCount: checkpoints.length,
      routePointCount: route.length,
      totalDistance: lengthMeters,
      firstPoint: route[0],
      lastPoint: route[route.length - 1],
      startsAndEndsAtSamePoint: route.length > 0 &&
        Math.abs(route[0].lat - route[route.length - 1].lat) < 0.0001 &&
        Math.abs(route[0].lng - route[route.length - 1].lng) < 0.0001
    });
  }

  return {
    checkpoints,
    route,
    totalDistance: lengthMeters
  };
};