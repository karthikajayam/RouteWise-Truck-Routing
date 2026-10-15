import api from "./api";

import { useEffect, useMemo, useState } from "react";



import {

  Bell,

  Clock3,

  Truck,

  Gauge,

  Navigation,

  Menu,

  X,

} from "lucide-react";



import Sidebar from "./components/Sidebar";

import StatCard from "./components/StatCard";

import RoutePlanner from "./components/RoutePlanner";

import RouteMap from "./components/RouteMap";

import WeatherForecast from "./components/WeatherForecast";

import RouteRecommendations from "./components/RouteRecommendations";



import "./App.css";



function getDefaultDepartureTime() {

  const date = new Date();

  date.setHours(date.getHours() + 1, 0, 0, 0);

  return `${String(date.getHours()).padStart(2, "0")}:00`;

}



function getTodayDate() {

  const today = new Date();

  const year = today.getFullYear();

  const month = String(today.getMonth() + 1).padStart(2, "0");

  const day = String(today.getDate()).padStart(2, "0");



  return `${year}-${month}-${day}`;

}



function App() {

  // Route planner inputs

  const [origin, setOrigin] = useState("Chennai");

  const [destination, setDestination] = useState("Bengaluru");

  const [truckLoad, setTruckLoad] = useState("25000");

  const [departure, setDeparture] = useState(getDefaultDepartureTime);

  const [departureDate, setDepartureDate] = useState(getTodayDate);

  const [intervalMiles, setIntervalMiles] = useState("25");



  // Dashboard controls

  const [forecastHour, setForecastHour] = useState(6);

  const [selectedRoute, setSelectedRoute] = useState(1);

  const [showAlerts, setShowAlerts] = useState(false);

  const [mobileMenu, setMobileMenu] = useState(false);

  const [isLoading, setIsLoading] = useState(false);



  // API data

  const [backendMessage, setBackendMessage] = useState("Connecting...");

  const [liveWeather, setLiveWeather] = useState(null);

  const [routeDistance, setRouteDistance] = useState(null);

  const [routeDuration, setRouteDuration] = useState(null);

  const [routeCoordinates, setRouteCoordinates] = useState(null);

  const [availableRoutes, setAvailableRoutes] = useState([]);

  const [routeError, setRouteError] = useState("");



  // Check Django backend connection

  useEffect(() => {

    api

      .get("/")

      .then((response) => {

        setBackendMessage(

          response.data.message || "Backend connected"

        );

      })

      .catch((error) => {

        console.error("Backend connection failed:", error);

        setBackendMessage("Backend connection failed");

      });

  }, []);



  // Fetch live weather forecast for Chennai.

  // This is a dashboard preview, separate from route checkpoint weather.

  useEffect(() => {

    let cancelled = false;



    async function fetchWeather() {

      try {

        const response = await fetch(

          "https\://api.open-meteo.com/v1/forecast?latitude=13.0827&longitude=80.2707&current=temperature_2m,wind_speed_10m&hourly=temperature_2m,wind_speed_10m,precipitation_probability&forecast_days=2&timezone=Asia%2FKolkata"

        );



        if (!response.ok) {

          throw new Error("Weather API request failed");

        }



        const data = await response.json();

        const hourly = data.hourly;



        if (!hourly?.time?.length) {

          throw new Error("Hourly weather data is unavailable");

        }



        const targetTime = new Date();

        targetTime.setMinutes(0, 0, 0);



        // Match local Chennai time returned by Open-Meteo.

        const localHour =

          `${targetTime.getFullYear()}-` +

          `${String(targetTime.getMonth() + 1).padStart(2, "0")}-` +

          `${String(targetTime.getDate()).padStart(2, "0")}T` +

          `${String(targetTime.getHours()).padStart(2, "0")}:00`;



        let weatherIndex = hourly.time.findIndex(

          (time) => time === localHour

        );



        if (weatherIndex < 0) {

          weatherIndex = 0;

        }



        if (!cancelled) {

          setLiveWeather({

            temperature: hourly.temperature_2m[weatherIndex],

            wind: hourly.wind_speed_10m[weatherIndex],

            rain:

              hourly.precipitation_probability?.[weatherIndex] ?? 0,

          });

        }

      } catch (error) {

        console.error("Weather fetch failed:", error);



        if (!cancelled) {

          setLiveWeather(null);

        }

      }

    }



    fetchWeather();



    return () => {

      cancelled = true;

    };

  }, []);



  // Only show routes returned by the backend; never present demo geometry as real.

  const displayedRoutes = availableRoutes;



  const activeRoute =

    displayedRoutes.find((route) => route.id === selectedRoute) ??

    displayedRoutes[0];



  const weather = useMemo(() => ({

    label: activeRoute?.risk || "Not calculated",

    tone: (activeRoute?.risk || "pending").toLowerCase().replace(/\s+/g, "-"),

    wind: 0,

    rain: 0,

  }), [activeRoute]);





  // Calculate route alternatives using Django.

  async function planRoute(event) {

    event.preventDefault();



    if (isLoading) return;



    setIsLoading(true);

    setRouteError("");



    try {

      // Get a CSRF token from Django. The frontend and backend use separate origins,
      // so the backend's cookie may not be readable through document.cookie here.
      const csrfResponse = await api.get("/");
      const csrfToken = csrfResponse.data.csrfToken;

      if (!csrfToken) {
        throw new Error(
          "Could not get CSRF token from backend. Please refresh and try again."
        );
      }

      const response = await api.post(
        "/api/plan-route/",
        {
          origin: origin.trim(),
          destination: destination.trim(),
          truckLoad: Number(truckLoad),
          departureDate,
          departureTime: departure,
          intervalMiles: Number(intervalMiles),
        },
        {
          headers: {
            "X-CSRFToken": csrfToken,
          },
        }
      );



      const data = response.data;

      const routesFromApi = Array.isArray(data.routes)

        ? data.routes

        : [];



      if (routesFromApi.length === 0) {

        throw new Error(

          "The backend did not return any routes. Please try again."

        );

      }



      const returnedRoutes = routesFromApi.map((route, index) => {

        const distanceKm = Number(route.distance_km ?? 0);

        const durationMinutes = Number(route.duration_minutes ?? 0);



        const coordinates =

          route.route_coordinates?.coordinates ??

          route.geometry?.coordinates ??

          [];



        return {

          ...route,

          id: route.id ?? index + 1,

          description:

            route.description || `Road route option ${index + 1}`,

          distance: `${distanceKm.toFixed(1)} km`,

          duration: `${Math.floor(durationMinutes / 60)}h ${

            Math.round(durationMinutes % 60)

          }m`,

          distance_km: distanceKm,

          duration_minutes: durationMinutes,

          risk:

            route.risk ??

            route.overall_risk ??

            route.risk_summary?.overall_risk ??

            "Pending",

          color: route.color || "#32d6b0",

          points: coordinates.map(([lng, lat]) => [lat, lng]),

        };

      });



      setAvailableRoutes(returnedRoutes);
      setForecastHour(0);

      // Select the backend's risk-aware recommendation by default.
      const firstRoute =
        returnedRoutes.find((route) => route.recommended) || returnedRoutes[0];



      setSelectedRoute(firstRoute.id);

      setRouteDistance(firstRoute.distance_km);

      setRouteDuration(firstRoute.duration_minutes);

      setRouteCoordinates(

        firstRoute.route_coordinates?.coordinates ??

          firstRoute.geometry?.coordinates ??

          null

      );



      setRouteError("");



      alert(

        "Routes calculated successfully!\n\n" +

          (data.route_limit_note ? `${data.route_limit_note}\n\n` : "") +

          `From: ${data.origin ?? origin}\n` +

          `To: ${data.destination ?? destination}\n` +

          `Truck load: ${truckLoad} lb\n` +

          `Departure: ${departureDate} ${departure}\n` +

          `Checkpoint interval: ${intervalMiles} miles\n` +

          `Routes returned: ${returnedRoutes.length}\n` +

          `Selected route distance: ${firstRoute.distance_km.toFixed(1)} km\n` +

          `Estimated driving time: ${Math.floor(

            firstRoute.duration_minutes / 60

          )}h ${Math.round(firstRoute.duration_minutes % 60)}m`

      );

    } catch (error) {

      console.error(

        "Route request failed:",

        error.response?.data || error

      );



      const message =

        error.response?.data?.error ||

        error.response?.data?.detail ||

        error.message ||

        "Route request failed. Check the browser console.";



      setRouteError(message);

      alert(message);

    } finally {

      setIsLoading(false);

    }

  }



  // Update the map and statistics when a route is selected.

  function handleSelectRoute(routeId) {

    setSelectedRoute(routeId);



    const route = displayedRoutes.find(

      (item) => item.id === routeId

    );



    if (!route) return;



    setRouteDistance(

      route.distance_km ?? null

    );



    setRouteDuration(

      route.duration_minutes ?? null

    );



    setRouteCoordinates(

      route.route_coordinates?.coordinates ??

        route.geometry?.coordinates ??

        null

    );

  }



  return (

    <div className="app-shell" id="dashboard">

      <p className="backend-status-message">

        Django status: {backendMessage}

      </p>



      <Sidebar />



      <main className="main-content">

        <header className="topbar">

          <div className="topbar-left">

            <button

              type="button"

              className="icon-button mobile-menu-button"

              onClick={() => setMobileMenu(!mobileMenu)}

              aria-label="Toggle navigation"

            >

              {mobileMenu ? <X size={21} /> : <Menu size={21} />}

            </button>



            <div>

              <div className="breadcrumb">Workspace / Dashboard</div>

              <h2>Fleet overview</h2>

            </div>

          </div>



          <div className="topbar-actions">

            <div className="system-status">

              <span className="status-dot" />

              {backendMessage === "Backend connection failed"

                ? "API disconnected"

                : "API connected"}

            </div>



            <button

              type="button"

              className="icon-button notification-button"

              onClick={() => setShowAlerts(!showAlerts)}

              aria-label="Toggle alerts"

              aria-expanded={showAlerts}

            >

              <Bell size={19} />

              <span className="notification-dot" />

            </button>



            <div className="today-label">

              <Clock3 size={16} />

              <span>Route monitor</span>

            </div>

          </div>

        </header>



        {showAlerts && (

          <div className="alert-popover">

            <strong>Weather notifications</strong>

            <p>

              {liveWeather

                ? `Chennai weather preview: ${liveWeather.temperature}°C, wind ${liveWeather.wind} km/h, rain probability ${liveWeather.rain}%. Route-specific alerts depend on the backend checkpoint results.`

                : "Live weather data is unavailable. Check your internet connection."}

            </p>

          </div>

        )}



        {mobileMenu && (

          <div className="mobile-menu-panel">

            <button

              type="button"

              onClick={() => setMobileMenu(false)}

              className="mobile-menu-dismiss"

            >

              <X size={17} /> Close menu

            </button>



            <a href="#dashboard" onClick={() => setMobileMenu(false)}>

              Dashboard

            </a>



            <a

              href="#route-planner"

              onClick={() => setMobileMenu(false)}

            >

              Route planner

            </a>



            <a href="#weather" onClick={() => setMobileMenu(false)}>

              Weather intelligence

            </a>



            <a href="#risk" onClick={() => setMobileMenu(false)}>

              Risk assessment

            </a>

          </div>

        )}



        <section className="welcome-row">

          <div>

            <p className="eyebrow">LOGISTICS CONTROL CENTER</p>

            <h1>Plan smarter. Drive safer.</h1>

            <p className="welcome-description">

              Weather-aware route planning for confident fleet decisions.

            </p>

          </div>



          <div className="live-chip">

            <span className="status-dot" />

            WEATHER MONITORING

          </div>

        </section>



        {routeError && (

          <div className="alert-popover" role="alert">

            <strong>Route planning failed</strong>

            <p>{routeError}</p>

          </div>

        )}



        <section className="stats-grid">

          <StatCard

            icon={Truck}

            label="Available routes"

            value={String(displayedRoutes.length).padStart(2, "0")}

            detail={

              availableRoutes.length > 0

                ? "Routes returned by routing API"

                : "Preview routes — calculate to update"

            }

            tone="teal"

          />



          <StatCard

            icon={Gauge}

            label="Weather risk"

            value={activeRoute?.risk ?? weather.label}

            detail={

              availableRoutes.length > 0

                ? "Risk reported by route API"

                : "Calculate a route to assess weather risk"

            }

            tone={weather.tone}

          />



          <StatCard

            icon={Navigation}

            label="Route distance"

            value={

              routeDistance !== null

                ? `${Number(routeDistance).toFixed(1)} km`

                : activeRoute?.distance ?? "—"

            }

            detail={

              availableRoutes.length > 0

                ? "Calculated road distance"

                : "Awaiting route calculation"

            }

            tone="blue"

          />



          <StatCard

            icon={Clock3}

            label="Estimated travel"

            value={

              routeDuration !== null

                ? `${Math.floor(routeDuration / 60)}h ${Math.round(

                    routeDuration % 60

                  )}m`

                : activeRoute?.duration ?? "—"

            }

            detail={

              availableRoutes.length > 0

                ? "Estimated driving time"

                : "Awaiting route calculation"

            }

            tone="purple"

          />

        </section>



        <div className="dashboard-grid">

          <RoutePlanner

            origin={origin}

            setOrigin={setOrigin}

            destination={destination}

            setDestination={setDestination}

            truckLoad={truckLoad}

            setTruckLoad={setTruckLoad}

            departure={departure}

            setDeparture={setDeparture}

            departureDate={departureDate}

            setDepartureDate={setDepartureDate}

            intervalMiles={intervalMiles}

            setIntervalMiles={setIntervalMiles}

            isLoading={isLoading}

            onSubmit={planRoute}

          />



          <RouteMap

            selectedRoute={selectedRoute}

            origin={origin}

            destination={destination}

            activeRoute={activeRoute}

            routeCoordinates={routeCoordinates}

            routeDistance={routeDistance}

            routeDuration={routeDuration}

            routes={availableRoutes}

            forecastHour={forecastHour}

          />

        </div>



        <div className="lower-grid">

          <WeatherForecast

            forecastHour={forecastHour}

            setForecastHour={setForecastHour}

            weather={weather}

            liveWeather={liveWeather}

            activeRoute={activeRoute}

          />



          <RouteRecommendations

            selectedRoute={selectedRoute}

            setSelectedRoute={handleSelectRoute}

            routes={displayedRoutes}

          />

        </div>



        <footer className="dashboard-footer">

          <span>RouteWise · Weather-Aware Truck Routing</span>



          <span>

            <span className="status-dot" />{" "}

            {backendMessage === "Backend connection failed"

              ? "Backend disconnected"

              : "Backend connected"}

            {" · "}

            {liveWeather ? "Live weather loaded" : "Weather unavailable"}

          </span>

        </footer>

      </main>

    </div>

  );

}



export default App;
