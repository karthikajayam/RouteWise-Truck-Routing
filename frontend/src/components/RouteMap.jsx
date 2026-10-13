import { useEffect, useMemo } from "react";
import { ArrowRight, Route } from "lucide-react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";

const ROUTE_COLORS = ["#32d6b0", "#f4b860", "#8a9cff"];

function routePositions(route) {
  if (Array.isArray(route?.points) && route.points.length > 1) return route.points;
  const coords = route?.route_coordinates?.coordinates ?? route?.geometry?.coordinates;
  return Array.isArray(coords) ? coords.map(([lng, lat]) => [lat, lng]) : [];
}

function FitMap({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 1) map.fitBounds(positions, { padding: [24, 24], maxZoom: 9 });
  }, [map, positions]);
  return null;
}

function riskColor(risk) {
  return ({
    Low: "#32d6b0",
    Moderate: "#f4b860",
    High: "#ff914d",
    Severe: "#ff5d73",
    "No Travel": "#d93654",
    Pending: "#9aa8b7",
  })[risk] || "#9aa8b7";
}

export default function RouteMap({
  selectedRoute,
  origin,
  destination,
  activeRoute,
  routes = [],
  routeCoordinates,
  routeDistance,
  routeDuration,
  forecastHour = 0,
}) {
  const positionsByRoute = useMemo(
    () => routes.map((route) => ({ route, positions: routePositions(route) })),
    [routes],
  );
  const activePositions = useMemo(() => {
    const fromRoute = routePositions(activeRoute);
    if (fromRoute.length > 1) return fromRoute;
    return Array.isArray(routeCoordinates)
      ? routeCoordinates.map(([lng, lat]) => [lat, lng])
      : [];
  }, [activeRoute, routeCoordinates]);
  const fitPositions = activePositions.length > 1
    ? activePositions
    : positionsByRoute.find((item) => item.positions.length > 1)?.positions || [];

  function openMaps() {
    window.open(
      `https://www.google.com/maps/dir/${encodeURIComponent(origin)}/${encodeURIComponent(destination)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  const checkpoints = activeRoute?.checkpoints || [];

  return (
    <section className="panel map-panel">
      <div className="panel-heading map-heading">
        <div className="heading-icon"><Route size={19} /></div>
        <div><h2>Route visualization</h2><p>{origin} <ArrowRight size={13} /> {destination}</p></div>
        <button className="map-action" onClick={openMaps} type="button">Open maps <ArrowRight size={14} /></button>
      </div>
      <div className="map-container">
        <MapContainer className="route-map" center={[12.5, 79]} zoom={7} scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitMap positions={fitPositions} />

          {positionsByRoute.map(({ route, positions }, index) => {
            if (positions.length < 2) return null;
            const isSelected = route.id === selectedRoute;
            return (
              <Polyline
                key={route.id}
                positions={positions}
                pathOptions={{
                  color: route.color || ROUTE_COLORS[index % ROUTE_COLORS.length],
                  weight: isSelected ? 6 : 3,
                  opacity: isSelected ? 0.95 : 0.55,
                  dashArray: isSelected ? undefined : "7 7",
                }}
              >
                <Tooltip sticky>{route.name || `Route option ${index + 1}`} · {route.risk || "Risk pending"}</Tooltip>
              </Polyline>
            );
          })}

          {checkpoints.map((checkpoint) => {
            const coords = checkpoint.coordinates;
            if (!coords || !Number.isFinite(Number(coords.latitude)) || !Number.isFinite(Number(coords.longitude))) return null;
            const forecastSnapshot = checkpoint.forecast_by_hour?.[String(forecastHour)];
            const displayedRisk = forecastSnapshot?.risk || (forecastHour === 0 ? checkpoint.risk : "Pending");
            const color = riskColor(displayedRisk);
            const weather = forecastSnapshot || (forecastHour === 0 ? checkpoint.weather : {}) || {};
            return (
              <CircleMarker
                key={`${activeRoute?.id}-${checkpoint.id}`}
                center={[Number(coords.latitude), Number(coords.longitude)]}
                radius={displayedRisk === "Severe" || displayedRisk === "No Travel" ? 7 : 5}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.88, weight: 1 }}
              >
                <Tooltip>
                  <strong>Checkpoint {checkpoint.id}</strong><br />
                  {checkpoint.distance_miles} miles from start<br />
                  Risk at +{forecastHour}h: {displayedRisk || "Pending"}<br />
                  ETA: {checkpoint.estimated_arrival ? new Date(checkpoint.estimated_arrival).toLocaleString() : "Unavailable"}<br />
                  {weather.available ? `Wind ${weather.wind_mph} mph · Rain ${weather.rain_inches_per_hour} in/hr · Snow ${weather.snow_inches_per_hour} in/hr` : "Weather forecast unavailable"}
                </Tooltip>
              </CircleMarker>
            );
          })}

          {activePositions.length > 1 && (
            <>
              <CircleMarker center={activePositions[0]} radius={7} pathOptions={{ color: "#071521", fillColor: "#32d6b0", fillOpacity: 1 }}>
                <Tooltip permanent>{origin} · Start</Tooltip>
              </CircleMarker>
              <CircleMarker center={activePositions[activePositions.length - 1]} radius={7} pathOptions={{ color: "#071521", fillColor: "#8a9cff", fillOpacity: 1 }}>
                <Tooltip permanent>{destination} · Destination</Tooltip>
              </CircleMarker>
            </>
          )}
        </MapContainer>
        <div className="map-overlay map-overlay-top"><span className="map-live-dot" />ROUTES & CHECKPOINT WEATHER</div>
        <div className="map-legend">
          <span><i className="legend-line recommended" />Selected route</span>
          <span><i className="legend-line alternative" />Other routes</span>
          <span><i style={{ background: "#32d6b0" }} />Low</span>
          <span><i style={{ background: "#f4b860" }} />Moderate</span>
          <span><i style={{ background: "#ff5d73" }} />Severe / No Travel</span>
        </div>
      </div>
      <div className="map-footer">
        <div><span className="footer-label">SELECTED ROUTE</span><strong>{activeRoute?.name || "No route calculated"}</strong></div>
        <div><span className="footer-label">DISTANCE</span><strong>{routeDistance !== null && routeDistance !== undefined ? `${routeDistance} km` : activeRoute?.distance || "—"}</strong></div>
        <div><span className="footer-label">DURATION</span><strong>{routeDuration !== null && routeDuration !== undefined ? `${Math.floor(routeDuration / 60)}h ${Math.round(routeDuration % 60)}m` : activeRoute?.duration || "—"}</strong></div>
      </div>
    </section>
  );
}
