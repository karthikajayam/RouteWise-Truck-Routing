from django.test import SimpleTestCase
from .views import (
    create_checkpoints,
    get_rain_risk,
    get_snow_risk,
    get_wind_risk,
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
