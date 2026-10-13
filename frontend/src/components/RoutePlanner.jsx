import {
  Compass,
  MapPin,
  Navigation,
  ArrowDownUp,
  ShieldCheck,
  Search,
  ArrowRight,
  CalendarDays,
  Route,
} from "lucide-react";

export default function RoutePlanner({
  origin,
  setOrigin,
  destination,
  setDestination,
  truckLoad,
  setTruckLoad,
  departure,
  setDeparture,
  departureDate,
  setDepartureDate,
  intervalMiles,
  setIntervalMiles,
  onSubmit,
  isLoading = false,
}) {
  function swapLocations() {
    setOrigin(destination);
    setDestination(origin);
  }

  return (
    <section
      className="panel route-planner-panel"
      id="route-planner"
    >
      <div className="panel-heading">
        <div className="heading-icon">
          <Compass size={19} />
        </div>

        <div>
          <h2>Route planner</h2>
          <p>Configure your next delivery journey</p>
        </div>

        <span className="panel-step">01 / PLAN</span>
      </div>

      <form onSubmit={onSubmit} className="route-form">
        <div className="field-label-row">
          <label htmlFor="origin">Starting point</label>
          <span>ORIGIN</span>
        </div>

        <div className="input-with-icon">
          <MapPin size={17} />

          <input
            id="origin"
            value={origin}
            onChange={(event) => setOrigin(event.target.value)}
            placeholder="Enter starting city"
            autoComplete="off"
            required
          />
        </div>

        <button
          type="button"
          className="swap-button"
          onClick={swapLocations}
          aria-label="Swap origin and destination"
        >
          <ArrowDownUp size={16} />
        </button>

        <div className="field-label-row">
          <label htmlFor="destination">Destination</label>
          <span>DESTINATION</span>
        </div>

        <div className="input-with-icon">
          <Navigation size={17} />

          <input
            id="destination"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder="Enter destination city"
            autoComplete="off"
            required
          />
        </div>

        <div className="form-two-columns">
          <div>
            <label htmlFor="truckLoad">Truck load (lb)</label>

            <input
              id="truckLoad"
              type="number"
              min="1"
              step="any"
              value={truckLoad}
              onChange={(event) => setTruckLoad(event.target.value)}
              placeholder="25000"
              required
            />
          </div>

          <div>
            <label htmlFor="departureDate">Departure date</label>

            <div className="input-with-icon">
              <CalendarDays size={17} />

              <input
                id="departureDate"
                type="date"
                value={departureDate}
                min={new Date().toLocaleDateString("en-CA")}
                onChange={(event) =>
                  setDepartureDate(event.target.value)
                }
                required
              />
            </div>
          </div>
        </div>

        <div className="form-two-columns">
          <div>
            <label htmlFor="departure">Departure time</label>

            <input
              id="departure"
              type="time"
              value={departure}
              onChange={(event) => setDeparture(event.target.value)}
              required
            />
          </div>

          <div>
            <label htmlFor="intervalMiles">Weather checkpoints</label>

            <select
              id="intervalMiles"
              value={intervalMiles}
              onChange={(event) =>
                setIntervalMiles(Number(event.target.value))
              }
              required
            >
              <option value={10}>Every 10 miles</option>
              <option value={25}>Every 25 miles</option>
              <option value={50}>Every 50 miles</option>
            </select>
          </div>
        </div>

        <div className="planner-note">
          <ShieldCheck size={17} />

          <span>
            <strong>Weather-aware planning</strong>
            <br />
            Check route conditions at estimated arrival times.
          </span>
        </div>

        <button
          className="primary-button"
          type="submit"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Route size={17} className="loading-icon" />
              Calculating routes...
            </>
          ) : (
            <>
              <Search size={17} />
              Preview route
              <ArrowRight size={17} />
            </>
          )}
        </button>

        <p className="demo-note">
          Route availability and weather forecasts depend on external APIs.
        </p>
      </form>
    </section>
  );
}
