import { ShieldCheck, AlertTriangle, CheckCircle2 } from "lucide-react";

export default function RouteRecommendations({ selectedRoute, setSelectedRoute, routes = [] }) {
  return (
    <section className="panel risk-panel" id="risk">
      <div className="panel-heading">
        <div className="heading-icon risk-heading-icon"><ShieldCheck size={19} /></div>
        <div><h2>Route recommendations</h2><p>Ranked by severe miles, high miles, average risk and travel time</p></div>
      </div>
      {routes.length ? <div className="route-options">
        {routes.map((route, index) => {
          const summary = route.risk_summary || {};
          const recommended = route.recommended || index === 0;
          return <button key={route.id} type="button" className={`route-option ${selectedRoute === route.id ? "route-option-active" : ""}`} onClick={() => setSelectedRoute(route.id)}>
            <span className="route-option-marker" style={{background:route.color || "#32d6b0"}} />
            <span className="route-option-info"><strong>{route.name || `Route option ${index + 1}`} {recommended ? "· Recommended" : ""}</strong><small>{route.description || "Road route with checkpoint weather assessment"}</small><span className="route-option-meta">{route.distance || `${Number(route.distance_km || 0).toFixed(1)} km`} <span>·</span> {route.duration || `${Math.floor((route.duration_minutes || 0) / 60)}h ${Math.round((route.duration_minutes || 0) % 60)}m`}</span><small>Severe: {summary.severe_miles_estimate ?? "—"} mi · High: {summary.high_miles_estimate ?? "—"} mi · Pending checkpoints: {summary.pending_checkpoints ?? "—"}</small></span>
            <span className={`risk-pill ${(route.risk || "pending").toLowerCase().replace(/\s+/g, "-")}`}>{route.risk || "Pending"}</span>
            {selectedRoute === route.id && <CheckCircle2 className="selected-check" size={17} />}
          </button>;
        })}
      </div> : <div className="route-empty-state"><strong>No routes calculated yet</strong><p>Enter your trip details and select Calculate routes to load real road routes and weather-risk comparisons.</p></div>}
      <div className="risk-disclaimer"><AlertTriangle size={17} /><p><strong>Safety reminder</strong><span>Forecast availability depends on the selected date and free weather-service coverage. Verify severe weather and road restrictions before dispatch.</span></p></div>
    </section>
  );
}
