# RouteWise — Weather-Aware Truck Routing

React + Vite frontend and Django REST-style backend for planning truck routes using road geometry, checkpoint weather, weather/load risk rules, and route ranking.

## Assessment requirements covered

- Origin, destination, departure date/time, truck load.
- OSRM road-route alternatives (the public free service may return fewer than three distinct routes; the backend tries alternate waypoint corridors and never invents route geometry).
- Weather checkpoints every 10, 25, or 50 miles, with estimated arrival time per checkpoint.
- Wind, rain, and snow risk thresholds plus truck-load wind rules.
- Route ranking: fewest severe miles, fewest high miles, lowest average risk, then shortest travel time.
- Leaflet map with routes and checkpoint markers.
- 0–48 hour corridor forecast slider and checkpoint risk distribution.

## Run locally on Windows

### 1. Backend

Open PowerShell in the project root:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Backend health check: `http://127.0.0.1:8000/`

### 2. Frontend

Open a second terminal at the project root:

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`).

For local development, `.env.example` points the frontend to `http://127.0.0.1:8000/`.

## Tests and build

Backend tests:

```powershell
cd backend
python manage.py test routing
```

Frontend quality checks:

```powershell
cd frontend
npm run lint
npm run build
```

## Deployment notes

Configure the frontend deployment environment variable:

- `VITE_API_BASE_URL=https://YOUR-BACKEND-HOST/`

Configure the Django backend environment variables:

- `SECRET_KEY`: a long random secret; do not commit it.
- `DEBUG=False`
- `ALLOWED_HOSTS=YOUR-BACKEND-HOST`
- `CORS_ALLOWED_ORIGINS=https://YOUR-FRONTEND-HOST`

Run `python manage.py migrate` as part of backend deployment. Ensure the frontend and backend URLs match the configured origins.

## Important behavior

- Weather values can legitimately be the same for different departure times if the forecast provider predicts the same conditions. The arrival-time summary uses the weather snapshot for the checkpoint's estimated arrival; the slider separately shows the corridor forecast at `now + 0..48h`.
- Historical departure times or dates outside the provider's forecast window can have unavailable checkpoint weather. The app should show unavailable/pending data rather than invent values.
- OSRM's public demo service is rate-limited and does not guarantee three distinct routes for every origin/destination. The app only displays routes returned by the routing service; it does not clone or fabricate routes.
- Open-Meteo and OpenStreetMap/OSRM are external services, so availability and forecast coverage depend on those providers.
