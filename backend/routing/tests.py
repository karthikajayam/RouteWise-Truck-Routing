from django.test import SimpleTestCase
from .views import (
    create_checkpoints,
    get_rain_risk,
    get_snow_risk,
    get_wind_risk,
    route_score,
)


class RiskThresholdTests(SimpleTestCase):
    def test_wind_risk_respects_load_thresholds(self):
        self.assertEqual(get_wind_risk(24.9, 25000), "Low")
        self.assertEqual(get_wind_risk(25, 25000), "Moderate")
        self.assertEqual(get_wind_risk(35, 25000), "High")
        self.assertEqual(get_wind_risk(45, 25000), "Severe")
        self.assertEqual(get_wind_risk(45, 35000), "No Travel")
        self.assertEqual(get_wind_risk(55, 10000), "No Travel")

    def test_rain_risk_thresholds(self):
        self.assertEqual(get_rain_risk(0.09), "Low")
        self.assertEqual(get_rain_risk(0.10), "Moderate")
        self.assertEqual(get_rain_risk(0.25), "High")
        self.assertEqual(get_rain_risk(0.50), "Severe")
        self.assertEqual(get_rain_risk(1.01), "No Travel")

    def test_snow_risk_thresholds(self):
        self.assertEqual(get_snow_risk(0.49), "Low")
        self.assertEqual(get_snow_risk(0.50), "Moderate")
        self.assertEqual(get_snow_risk(1.0), "High")
        self.assertEqual(get_snow_risk(2.0), "Severe")
        self.assertEqual(get_snow_risk(3.01), "No Travel")

    def test_destination_is_included_as_final_checkpoint(self):
        geometry = {
            "type": "LineString",
            "coordinates": [[80.2707, 13.0827], [79.1325, 12.9165]],
        }
        checkpoints = create_checkpoints(geometry, 10)
        self.assertGreaterEqual(len(checkpoints), 1)
        self.assertAlmostEqual(
            checkpoints[-1]["coordinates"]["longitude"],
            79.1325,
            places=4,
        )
        self.assertGreater(checkpoints[-1]["segment_miles"], 0)


class RouteRankingTests(SimpleTestCase):
    def test_route_ranking_prioritizes_severe_miles_then_high_miles(self):
        base = {
            "risk_summary": {
                "severe_miles_estimate": 0,
                "high_miles_estimate": 0,
                "average_risk_score": 1,
                "pending_checkpoints": 0,
            },
            "duration_minutes": 300,
        }
        longer_but_safer = {
            **base,
            "risk_summary": {**base["risk_summary"], "severe_miles_estimate": 0},
            "duration_minutes": 360,
        }
        shorter_but_severe = {
            **base,
            "risk_summary": {**base["risk_summary"], "severe_miles_estimate": 10},
            "duration_minutes": 180,
        }
        self.assertLess(route_score(longer_but_safer), route_score(shorter_but_severe))

    def test_travel_time_breaks_ties_after_risk(self):
        common_summary = {
            "severe_miles_estimate": 0,
            "high_miles_estimate": 5,
            "average_risk_score": 1,
            "pending_checkpoints": 0,
        }
        fast = {"risk_summary": common_summary, "duration_minutes": 200}
        slow = {"risk_summary": common_summary, "duration_minutes": 250}
        self.assertLess(route_score(fast), route_score(slow))
