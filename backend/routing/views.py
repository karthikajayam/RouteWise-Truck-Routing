import json
import logging

import math

from datetime import datetime, timedelta

from zoneinfo import ZoneInfo

from concurrent.futures import ThreadPoolExecutor

import requests

from functools import lru_cache

from django.http import JsonResponse

from django.middleware.csrf import get_token

from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie

INDIA_TZ = ZoneInfo("Asia/Kolkata")

RISK_SCORE = {

    "Low": 0,

    "Moderate": 1,

    "High": 2,

    "Severe": 3,

    "No Travel": 4,

}

# ---------------- RISK RULES ----------------

def get_wind_risk(wind_mph, truck_load_lb):

    if wind_mph >= 55:

        return "No Travel"

    if wind_mph >= 45:

        return "No Travel" if truck_load_lb > 30000 else "Severe"

    if wind_mph >= 35:

        return "Severe" if truck_load_lb > 40000 else "High"

    if wind_mph >= 25:

        return "Moderate"

    return "Low"

def get_rain_risk(rain_inches_per_hour):

    if rain_inches_per_hour > 1.0:

        return "No Travel"

    if rain_inches_per_hour >= 0.5:

        return "Severe"

    if rain_inches_per_hour >= 0.25:

        return "High"

    if rain_inches_per_hour >= 0.10:

        return "Moderate"

    return "Low"

def get_snow_risk(snow_inches_per_hour):

    # Check the highest threshold first so >3 in/hr is always No Travel.

    if snow_inches_per_hour > 3.0:

        return "No Travel"

    if snow_inches_per_hour >= 2.0:

        return "Severe"

    if snow_inches_per_hour >= 1.0:

        return "High"

    if snow_inches_per_hour >= 0.5:

        return "Moderate"

    return "Low"

def highest_risk(*risks):

    return max(risks, key=lambda risk: RISK_SCORE[risk])

# ---------------- DISTANCE ----------------

def distance_miles(point_a, point_b):

    lon1, lat1 = point_a

    lon2, lat2 = point_b

    radius = 3958.8

    lat1 = math.radians(lat1)

    lat2 = math.radians(lat2)

    delta_lat = lat2 - lat1

    delta_lon = math.radians(lon2 - lon1)

    a = (

        math.sin(delta_lat / 2) ** 2

        + math.cos(lat1)

        * math.cos(lat2)

        * math.sin(delta_lon / 2) ** 2

    )

    a = max(0.0, min(1.0, a))

    return radius * 2 * math.atan2(

        math.sqrt(a),

        math.sqrt(1 - a),

    )

@lru_cache(maxsize=128)

def geocode_location(place_name):

    """Resolve a city/place to longitude,latitude using OpenStreetMap Nominatim."""

    known = {

        "chennai": "80.2707,13.0827",

        "bengaluru": "77.5946,12.9716",

        "bangalore": "77.5946,12.9716",

    }

    if place_name.strip().lower() in known:

        return known[place_name.strip().lower()]

    try:

        response = requests.get(

            "https://nominatim.openstreetmap.org/search",

            params={"q": place_name, "format": "jsonv2", "limit": 1},

            headers={"User-Agent": "RouteWiseTruckRoutingAssessment/1.0 (educational project)"},

            timeout=10,

        )

        response.raise_for_status()

        results = response.json()

        if not results:

            return None

        return f"{float(results[0]['lon'])},{float(results[0]['lat'])}"

    except (requests.RequestException, ValueError, KeyError, TypeError):

        return None

# ---------------- CHECKPOINTS ----------------

def create_checkpoints(route_geometry, interval_miles=25):

    if interval_miles not in (10, 25, 50):

        raise ValueError("Interval must be 10, 25, or 50 miles")

    if not route_geometry:

        return []

    coordinates = route_geometry.get("coordinates", [])

    if len(coordinates) < 2:

        return []

    checkpoints = []

    total_distance = 0.0

    next_checkpoint = float(interval_miles)

    for index in range(1, len(coordinates)):

        start = coordinates[index - 1]

        end = coordinates[index]

        segment_distance = distance_miles(start, end)

        if segment_distance <= 0:

            continue

        segment_end = total_distance + segment_distance

        while next_checkpoint <= segment_end:

            fraction = (

                (next_checkpoint - total_distance)

                / segment_distance

            )

            longitude = start[0] + fraction * (end[0] - start[0])

            latitude = start[1] + fraction * (end[1] - start[1])

            checkpoints.append({

                "id": len(checkpoints) + 1,

                "distance_miles": round(next_checkpoint, 2),

                "coordinates": {

                    "longitude": longitude,

                    "latitude": latitude,

                },

                "weather": None,

                "risk": "Pending",

                "estimated_arrival": None,

            })

            next_checkpoint += interval_miles

        total_distance = segment_end

    # Add the actual destination as a final checkpoint so the last partial

    # segment is assessed rather than silently omitted.

    final_coordinate = coordinates[-1]

    last_distance = checkpoints[-1]["distance_miles"] if checkpoints else 0.0

    remaining = max(0.0, total_distance - last_distance)

    if remaining > 0.5:

        checkpoints.append({

            "id": len(checkpoints) + 1,

            "distance_miles": round(total_distance, 2),

            "segment_miles": round(remaining, 2),

            "coordinates": {

                "longitude": final_coordinate[0],

                "latitude": final_coordinate[1],

            },

            "weather": None,

            "risk": "Pending",

            "estimated_arrival": None,

        })

    # Each regular checkpoint covers the interval immediately before it.

    previous_distance = 0.0

    for checkpoint in checkpoints:

        if "segment_miles" not in checkpoint:

            checkpoint["segment_miles"] = round(

                max(0.0, checkpoint["distance_miles"] - previous_distance), 2

            )

        previous_distance = checkpoint["distance_miles"]

    return checkpoints

# ---------------- WEATHER API ----------------

def get_checkpoint_weather(latitude, longitude):

    url = "https://api.open-meteo.com/v1/forecast"

    params = {

        "latitude": latitude,

        "longitude": longitude,

        "hourly": (

            "temperature_2m,"

            "precipitation,"

            "rain,"

            "snowfall,"

            "wind_speed_10m"

        ),

        "forecast_days": 3,

        "wind_speed_unit": "mph",

        "precipitation_unit": "inch",

        "timezone": "Asia/Kolkata",

    }

    try:

        response = requests.get(

            url,

            params=params,

            timeout=10,

        )

        response.raise_for_status()

        hourly = response.json().get("hourly", {})

        if not hourly.get("time"):

            return {

                "available": False,

                "error": "Weather forecast unavailable",

            }

        return {

            "available": True,

            "time": hourly.get("time", []),

            "temperature": hourly.get("temperature_2m", []),

            "precipitation": hourly.get("precipitation", []),

            "rain": hourly.get("rain", []),

            "snowfall": hourly.get("snowfall", []),

            "wind_mph": hourly.get("wind_speed_10m", []),

        }

    except (requests.RequestException, ValueError):

        return {

            "available": False,

            "error": "Weather service unavailable",

        }

@lru_cache(maxsize=256)

def cached_checkpoint_weather(latitude, longitude):

    return get_checkpoint_weather(latitude, longitude)


def _nearest_forecast_index(forecast, target_time):
    """Return the index of the forecast hour closest to target_time."""
    times = forecast.get("time", [])
    if not times:
        return None

    try:
        target_local = target_time.astimezone(INDIA_TZ).replace(
            minute=0, second=0, microsecond=0, tzinfo=None
        )
        parsed_times = []
        for index, value in enumerate(times):
            try:
                parsed_times.append((index, datetime.fromisoformat(value)))
            except (TypeError, ValueError):
                continue

        if not parsed_times:
            return None

        return min(
            parsed_times,
            key=lambda item: abs((item[1] - target_local).total_seconds()),
        )[0]
    except (TypeError, ValueError, OverflowError):
        return None


def _forecast_value(forecast, key, index):
    """Safely read a numeric value from an hourly forecast array."""
    values = forecast.get(key, [])
    if index < 0 or index >= len(values) or values[index] is None:
        return None

    try:
        value = float(values[index])
        return value if math.isfinite(value) else None
    except (ValueError, TypeError):
        return None


def weather_risk_snapshot(forecast, target_time, truck_load_lb):
    """Return real weather values and risk for the selected forecast hour."""
    if not forecast.get("available"):
        return None

    index = _nearest_forecast_index(forecast, target_time)
    if index is None:
        return None

    wind = _forecast_value(forecast, "wind_mph", index)
    rain = _forecast_value(forecast, "rain", index)
    snow_cm = _forecast_value(forecast, "snowfall", index)
    temperature = _forecast_value(forecast, "temperature", index)

    if wind is None or rain is None or snow_cm is None:
        return None

    snow_inches = snow_cm / 2.54

    wind_risk = get_wind_risk(wind, truck_load_lb)
    rain_risk = get_rain_risk(rain)
    snow_risk = get_snow_risk(snow_inches)

    return {
        "available": True,
        "forecast_time": forecast["time"][index],
        "temperature_c": temperature,
        "wind_mph": round(wind, 1),
        "rain_inches_per_hour": round(rain, 3),
        "snow_inches_per_hour": round(snow_inches, 3),
        "wind_risk": wind_risk,
        "rain_risk": rain_risk,
        "snow_risk": snow_risk,
        "risk": highest_risk(wind_risk, rain_risk, snow_risk),
    }



def get_weather_at_arrival(forecast, arrival):

    if not forecast.get("available"):

        return None

    target_time = arrival.astimezone(INDIA_TZ).strftime(

        "%Y-%m-%dT%H:00"

    )

    times = forecast.get("time", [])

    try:

        index = times.index(target_time)

    except ValueError:

        return None

    def get_value(key):

        values = forecast.get(key, [])

        if index >= len(values) or values[index] is None:

            return None

        try:

            return float(values[index])

        except (ValueError, TypeError):

            return None

    temperature = get_value("temperature")

    wind = get_value("wind_mph")

    rain = get_value("rain")

    snowfall = get_value("snowfall")

    if wind is None or rain is None or snowfall is None:

        return None

    return {

        "forecast_time": target_time,

        "temperature_c": temperature,

        "wind_mph": wind,

        "rain_inches_per_hour": rain,

        "snow_inches_per_hour": snowfall / 2.54,

    }

# ---------------- PARALLEL WEATHER EVALUATION ----------------

def evaluate_checkpoints(

    checkpoints,

    route_distance_km,

    duration_minutes,

    departure,

    truck_load_lb,

):

    route_miles = route_distance_km / 1.609344

    if route_miles <= 0 or not checkpoints:

        return checkpoints

    jobs = []

    for checkpoint in checkpoints:

        progress = min(

            checkpoint["distance_miles"] / route_miles,

            1.0,

        )

        arrival = departure + timedelta(

            minutes=duration_minutes * progress

        )

        checkpoint["estimated_arrival"] = arrival.isoformat()

        latitude = checkpoint["coordinates"]["latitude"]

        longitude = checkpoint["coordinates"]["longitude"]

        jobs.append({

            "checkpoint": checkpoint,

            "latitude": latitude,

            "longitude": longitude,

            "arrival": arrival,

            "cache_key": (

                round(latitude, 2),

                round(longitude, 2),

            ),

        })

    unique_locations = {}

    for job in jobs:

        unique_locations[job["cache_key"]] = (

            job["latitude"],

            job["longitude"],

        )

    weather_cache = {}

    # Fetch weather from different locations concurrently.

    with ThreadPoolExecutor(max_workers=8) as executor:

        futures = {

            key: executor.submit(

                cached_checkpoint_weather,

                latitude,

                longitude,

            )

            for key, (latitude, longitude)

            in unique_locations.items()

        }

        for key, future in futures.items():

            try:

                weather_cache[key] = future.result()

            except Exception:

                weather_cache[key] = {

                    "available": False,

                    "error": "Weather service unavailable",

                }

    # Calculate risk for each checkpoint.

    for job in jobs:

        checkpoint = job["checkpoint"]

        location_forecast = weather_cache[job["cache_key"]]

        weather = get_weather_at_arrival(

            location_forecast,

            job["arrival"],

        )

        # The map slider uses a real hourly forecast at each checkpoint.

        # Values are keyed by hours from the current hour (0..48).

        forecast_by_hour = {}

        now_hour = datetime.now(INDIA_TZ).replace(minute=0, second=0, microsecond=0)

        for hour_offset in range(49):

            snapshot = weather_risk_snapshot(

                location_forecast,

                now_hour + timedelta(hours=hour_offset),

                truck_load_lb,

            )

            if snapshot is not None:

                forecast_by_hour[str(hour_offset)] = snapshot

        checkpoint["forecast_by_hour"] = forecast_by_hour

        if weather is None:

            checkpoint["risk"] = "Pending"

            checkpoint["weather"] = {

                "available": False,

                "message": "Forecast unavailable for arrival time",

            }

            continue

        wind_risk = get_wind_risk(

            weather["wind_mph"],

            truck_load_lb,

        )

        rain_risk = get_rain_risk(

            weather["rain_inches_per_hour"]

        )

        snow_risk = get_snow_risk(

            weather["snow_inches_per_hour"]

        )

        checkpoint["weather"] = {

            "available": True,

            **weather,

            "wind_risk": wind_risk,

            "rain_risk": rain_risk,

            "snow_risk": snow_risk,

        }

        checkpoint["risk"] = highest_risk(

            wind_risk,

            rain_risk,

            snow_risk,

        )

    return checkpoints

# ---------------- ROUTE SUMMARY ----------------

def summarize_route(route):

    interval = route["checkpoint_interval_miles"]

    severe_miles = 0.0

    high_miles = 0.0

    scores = []

    pending = 0

    for checkpoint in route["checkpoints"]:

        risk = checkpoint["risk"]

        if risk == "Pending":

            pending += 1

            continue

        scores.append(RISK_SCORE[risk])

        checkpoint_miles = float(checkpoint.get("segment_miles", interval))

        if risk in ("Severe", "No Travel"):

            severe_miles += checkpoint_miles

        elif risk == "High":

            high_miles += checkpoint_miles

    route["risk_summary"] = {

        "severe_miles_estimate": round(severe_miles, 2),

        "high_miles_estimate": round(high_miles, 2),

        "average_risk_score": (

            round(sum(scores) / len(scores), 2)

            if scores else None

        ),

        "evaluated_checkpoints": len(scores),

        "pending_checkpoints": pending,

        "no_travel_detected": any(

            item["risk"] == "No Travel"

            for item in route["checkpoints"]

        ),

    }

    known_risks = [

        item["risk"]

        for item in route["checkpoints"]

        if item["risk"] != "Pending"

    ]

    route["risk"] = (

        max(known_risks, key=lambda risk: RISK_SCORE[risk])

        if known_risks else "Pending"

    )

    return route

def route_score(route):

    summary = route["risk_summary"]

    average_risk = summary["average_risk_score"]

    if average_risk is None:

        average_risk = float("inf")

    return (

        summary["severe_miles_estimate"],

        summary["high_miles_estimate"],

        average_risk,

        route["duration_minutes"],

        summary["pending_checkpoints"],

    )

# ---------------- HOME ENDPOINT ----------------

@ensure_csrf_cookie

def home(request):

    return JsonResponse({

        "message": "Truck Routing API is working!",

        "csrfToken": get_token(request),

    })

# ---------------- ROUTE CANDIDATES ----------------

def fetch_route_candidates(origin_coordinate, destination_coordinate, origin, destination):

    """Fetch real OSRM routes, try known alternate corridors, and reject duplicates.

    OSRM's public service does not guarantee three routes. This function only

    returns road geometries actually returned by OSRM; it never fabricates or
    clones a route. For generic city pairs, offset waypoints are used to ask
    OSRM for genuinely routed alternatives when its default alternatives are
    insufficient. The public free service can still return fewer than three.

    """

    base = "https://router.project-osrm.org/route/v1/driving/"

    candidates = []

    signatures = set()

    def add_routes(url):

        try:

            response = requests.get(url, timeout=15)

            response.raise_for_status()

            payload = response.json()

        except (requests.RequestException, ValueError, TypeError):

            return

        if payload.get("code") != "Ok":

            return

        for route in payload.get("routes", []):

            geometry = route.get("geometry") or {}

            coordinates = geometry.get("coordinates") or []

            if len(coordinates) < 2:

                continue

            # Sample a fixed number of positions so identical geometry is

            # detected even when the API returns a different number of points.

            last = len(coordinates) - 1

            sample_indices = sorted({round(i * last / 40) for i in range(41)})

            signature = tuple(

                (round(coordinates[i][0], 3), round(coordinates[i][1], 3))

                for i in sample_indices

            )

            if signature in signatures:

                continue

            signatures.add(signature)

            candidates.append(route)

    add_routes(

        f"{base}{origin_coordinate};{destination_coordinate}"

        "?alternatives=3&overview=full&geometries=geojson"

    )

    origin_key = origin.strip().casefold()

    destination_key = destination.strip().casefold()

    # Waypoints are longitude,latitude and are used only for the corridors

    # listed below. Other trips use the alternatives supplied by OSRM.

    corridors = {

        ("coimbatore", "chennai"): [

            ["77.7172,11.3410", "78.1460,11.6643", "79.4861,11.9401"],

            ["78.0767,10.9601", "78.7047,10.7905", "79.4861,11.9401"],

            ["77.7172,11.3410", "78.7047,10.7905", "79.4861,11.9401"],

        ],

        ("chennai", "bengaluru"): [

            ["79.1325,12.9165", "78.2138,12.5186"],

            ["79.0747,12.2253", "78.1582,12.1277", "77.8253,12.7409"],

            ["79.5310,12.6810", "78.4867,12.3051", "77.8253,12.7409"],

        ],

    }

    def canonical_place(value):

        value = value.strip().casefold()

        return {"bangalore": "bengaluru", "coimbatore city": "coimbatore"}.get(value, value)

    key = (canonical_place(origin_key), canonical_place(destination_key))

    reverse_key = (key[1], key[0])

    waypoint_sets = corridors.get(key)

    if waypoint_sets is None and reverse_key in corridors:

        waypoint_sets = [list(reversed(points)) for points in corridors[reverse_key]]

    # For city pairs without a hand-curated corridor, try real OSRM routes
    # through several offset waypoints near the straight-line midpoint. OSRM
    # snaps each waypoint to its road network; route geometry is always returned
    # by the routing API (we never draw synthetic route lines).
    if waypoint_sets is None:
        try:
            origin_lon, origin_lat = map(float, origin_coordinate.split(","))
            destination_lon, destination_lat = map(float, destination_coordinate.split(","))
            delta_lon = destination_lon - origin_lon
            delta_lat = destination_lat - origin_lat
            magnitude = math.hypot(delta_lon, delta_lat) or 1.0
            perpendicular_lon = -delta_lat / magnitude
            perpendicular_lat = delta_lon / magnitude
            waypoint_sets = []
            for fraction, offset in (
                (0.45, 0.16),
                (0.55, -0.16),
                (0.38, 0.25),
                (0.62, -0.25),
                (0.50, 0.32),
            ):
                waypoint_lon = origin_lon + delta_lon * fraction + perpendicular_lon * offset
                waypoint_lat = origin_lat + delta_lat * fraction + perpendicular_lat * offset
                waypoint_sets.append([f"{waypoint_lon:.5f},{waypoint_lat:.5f}"])
        except (TypeError, ValueError):
            waypoint_sets = []

    for waypoints in waypoint_sets:
        if len(candidates) >= 3:
            break
        locations = ";".join([origin_coordinate, *waypoints, destination_coordinate])
        add_routes(
            f"{base}{locations}?overview=full&geometries=geojson&steps=false&alternatives=3"
        )

    return candidates[:3]

# ---------------- PLAN ROUTE ENDPOINT ----------------

@csrf_exempt
def plan_route(request):

    if request.method != "POST":

        return JsonResponse(

            {"error": "Use POST method"},

            status=405,

        )

    try:

        data = json.loads(request.body)

    except (json.JSONDecodeError, UnicodeDecodeError):

        return JsonResponse(

            {"error": "Invalid JSON data"},

            status=400,

        )

    origin = data.get("origin", "")

    destination = data.get("destination", "")

    if not isinstance(origin, str) or not isinstance(destination, str):

        return JsonResponse(

            {"error": "Origin and destination must be text"},

            status=400,

        )

    origin = origin.strip()

    destination = destination.strip()

    if not origin or not destination or origin == destination:

        return JsonResponse(

            {"error": "Enter different origin and destination locations"},

            status=400,

        )

    # Frontend already sends truck load in pounds.

    try:

        truck_load_lb = float(data.get("truckLoad", ""))

        if not math.isfinite(truck_load_lb) or truck_load_lb <= 0:

            raise ValueError

    except (ValueError, TypeError):

        return JsonResponse(

            {"error": "Truck load must be a positive number in lb"},

            status=400,

        )

    try:

        interval_miles = int(data.get("intervalMiles", 25))

    except (ValueError, TypeError):

        return JsonResponse(

            {"error": "Checkpoint interval must be 10, 25, or 50 miles"},

            status=400,

        )

    if interval_miles not in (10, 25, 50):

        return JsonResponse(

            {"error": "Checkpoint interval must be 10, 25, or 50 miles"},

            status=400,

        )

    # Resolve user-entered locations instead of restricting the planner to two cities.

    origin_coordinate = geocode_location(origin)

    destination_coordinate = geocode_location(destination)

    if not origin_coordinate or not destination_coordinate:

        return JsonResponse(

            {"error": "Could not find one of those locations. Enter a city or town name and try again."},

            status=400,

        )

    departure_date = data.get("departureDate")

    departure_time = data.get(

        "departureTime",

        data.get("departure", "08:00"),

    )

    try:

        if departure_date:

            departure = datetime.fromisoformat(

                f"{departure_date}T{departure_time}"

            ).replace(tzinfo=INDIA_TZ)

        else:

            now = datetime.now(INDIA_TZ)

            departure = datetime.combine(

                now.date(),

                datetime.strptime(

                    departure_time,

                    "%H:%M",

                ).time(),

                tzinfo=INDIA_TZ,

            )

            if departure < now:

                departure += timedelta(days=1)

    except (ValueError, TypeError):

        return JsonResponse(

            {"error": "Invalid departure date or time"},

            status=400,

        )

    route_candidates = fetch_route_candidates(

        origin_coordinate,

        destination_coordinate,

        origin,

        destination,

    )

    if not route_candidates:

        return JsonResponse(

            {"error": "Could not calculate a road route. The free routing service may be temporarily unavailable."},

            status=502,

        )

    formatted_routes = []

    for index, route in enumerate(route_candidates):

        distance_km = route["distance"] / 1000

        duration_minutes = round(route["duration"] / 60)

        checkpoints = create_checkpoints(

            route.get("geometry"),

            interval_miles,

        )

        checkpoints = evaluate_checkpoints(

            checkpoints,

            distance_km,

            duration_minutes,

            departure,

            truck_load_lb,

        )

        formatted_route = {

            "id": index + 1,

            "name": ["Recommended route", "Alternative route 1", "Alternative route 2"][index],

            "description": "Distinct OSRM road geometry with checkpoint weather risk",

            "color": ["#32d6b0", "#f4b860", "#8a9cff"][index],

            "distance_km": round(distance_km, 2),

            "duration_minutes": duration_minutes,

            "route_coordinates": route.get("geometry"),

            "checkpoint_interval_miles": interval_miles,

            "checkpoints": checkpoints,

            "truck_load_lb": truck_load_lb,

            "departure_datetime": departure.isoformat(),

            "risk": "Pending",

            "weather_status": "Weather evaluated where available",

        }

        formatted_routes.append(

            summarize_route(formatted_route)

        )

    recommended_route = min(

        formatted_routes,

        key=route_score,

    )

    for route in formatted_routes:

        route["recommended"] = (

            route["id"] == recommended_route["id"]

        )

    return JsonResponse({

        "message": "Routes and checkpoint risk assessment calculated",

        "route_limit_note": ("The free routing service returned fewer than three unique routes for this trip." if len(formatted_routes) < 3 else None),

        "origin": origin,

        "destination": destination,

        "truckLoad": truck_load_lb,

        "departureDate": departure.date().isoformat(),

        "departureTime": departure.strftime("%H:%M"),

        "intervalMiles": interval_miles,

        "route_count": len(formatted_routes),

        "routes": formatted_routes,

        "recommended_route_id": recommended_route["id"],

        "recommendation": (

            "Recommended using checkpoint risk and travel time"

        ),

        "distance_km": recommended_route["distance_km"],

        "duration_minutes": recommended_route["duration_minutes"],

        "route_coordinates": recommended_route["route_coordinates"],

    })


logger = logging.getLogger(__name__)

def csrf_failure(request, reason=""):
    logger.error(
        "CSRF FAILURE: %s | Origin: %s | Referer: %s",
        reason,
        request.META.get("HTTP_ORIGIN"),
        request.META.get("HTTP_REFERER"),
    )
    return JsonResponse(
        {"error": "CSRF verification failed"},
        status=403,
    )