import { CloudSun, CloudRain, Wind, Thermometer, MapPinned } from "lucide-react";

const RISK_ORDER = ["Low", "Moderate", "High", "Severe", "No Travel"];

export default function WeatherForecast({
  forecastHour,
  setForecastHour,
  weather,
  liveWeather,
  activeRoute,
}) {
  const checkpoints = activeRoute?.checkpoints || [];
  const snapshots = checkpoints
    .map((checkpoint) => checkpoint.forecast_by_hour?.[String(forecastHour)])
    .filter(Boolean);
  const representative = snapshots[0] || null;
  const riskCounts = snapshots.reduce((counts, item) => {
    const risk = item.risk || "Pending";
    counts[risk] = (counts[risk] || 0) + 1;
    return counts;
  }, {});
  const hasRouteForecast = snapshots.length > 0;

  return (
    <section className="panel forecast-panel" id="weather">
      <div className="panel-heading">
        <div className="heading-icon weather-icon"><CloudSun size={19} /></div>
        <div><h2>Weather & corridor heatmap</h2><p>Hourly checkpoint forecast across the selected route</p></div>
        <span className="demo-tag">{hasRouteForecast ? "ROUTE FORECAST" : liveWeather ? "LIVE CITY DATA" : "AWAITING ROUTE"}</span>
      </div>
      <div className="forecast-main">
        <div className="weather-summary">
          <div className="weather-symbol">{representative?.rain_inches_per_hour > 0.1 ? <CloudRain size={35} /> : <CloudSun size={35} />}</div>
          <div>
            <h3>{representative?.temperature_c != null ? `${representative.temperature_c}°C` : liveWeather ? `${liveWeather.temperature}°C` : "No forecast"}</h3>
            <p>{representative ? `Checkpoint forecast at ${representative.forecast_time}` : "Calculate a route to load checkpoint weather"}</p>
          </div>
        </div>
        <div className="weather-metrics">
          <div><Wind size={17} /><span>Wind speed</span><strong>{representative ? `${representative.wind_mph} mph` : "—"}</strong></div>
          <div><CloudRain size={17} /><span>Rain rate</span><strong>{representative ? `${representative.rain_inches_per_hour} in/hr` : "—"}</strong></div>
          <div><Thermometer size={17} /><span>Snow rate</span><strong>{representative ? `${representative.snow_inches_per_hour} in/hr` : "—"}</strong></div>
        </div>
      </div>
      <div className="timeline-header"><label htmlFor="forecastHour"><MapPinned size={14} /> Corridor forecast time</label><strong>+{forecastHour}h</strong></div>
      <input className="forecast-slider" id="forecastHour" type="range" min="0" max="48" step="1" value={forecastHour} onChange={e => setForecastHour(Number(e.target.value))} />
      <div className="timeline-ticks"><span>Now</span><span>+12h</span><span>+24h</span><span>+36h</span><span>+48h</span></div>
      <div className="heatmap-summary">
        <strong>Checkpoint risk distribution</strong>
        {hasRouteForecast ? <div className="risk-counts">{RISK_ORDER.map((risk) => <span key={risk} className={`risk-count risk-${risk.toLowerCase().replace(/\s+/g, "-")}`}><i />{risk}: {riskCounts[risk] || 0}</span>)}</div> : <p>Route checkpoint forecasts appear here after calculation. The map markers update with this slider.</p>}
        {hasRouteForecast && <small>{snapshots.length} of {checkpoints.length} checkpoints have forecast data for +{forecastHour}h.</small>}
      </div>
    </section>
  );
}
