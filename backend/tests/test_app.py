from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

try:
    from backend import create_app
except ModuleNotFoundError:
    from app import create_app


class FlaskAppTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        snapshot_path = Path(self.temp_dir.name) / "canvas_snapshot.json"

        app = create_app(
            {
                "TESTING": True,
                "SNAPSHOT_PATH": snapshot_path,
            }
        )
        self.client = app.test_client()
        self.snapshot_path = snapshot_path

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_health_endpoint(self) -> None:
        response = self.client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["service"], "canvasact-backend")

    def test_canvas_snapshot_round_trip(self) -> None:
        save_response = self.client.put(
            "/api/canvas-snapshot",
            json={"snapshot": {"document": {"pages": []}}},
        )

        self.assertEqual(save_response.status_code, 200)
        self.assertTrue(self.snapshot_path.exists())

        load_response = self.client.get("/api/canvas-snapshot")
        payload = load_response.get_json()

        self.assertEqual(load_response.status_code, 200)
        self.assertTrue(payload["hasSavedState"])
        self.assertEqual(payload["snapshot"], {"document": {"pages": []}})

    def test_canvas_snapshot_rejects_invalid_payload(self) -> None:
        response = self.client.put("/api/canvas-snapshot", json={"snapshot": []})

        self.assertEqual(response.status_code, 400)
        payload = response.get_json()
        self.assertIn("snapshot", payload["error"])


if __name__ == "__main__":
    unittest.main()
