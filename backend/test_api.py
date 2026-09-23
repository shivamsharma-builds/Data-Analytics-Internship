import os
import sys
import tempfile
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
from app import app, DATA_DIR

def test_health():
    client = app.test_client()
    response = client.get("/api/health")
    assert response.status_code == 200

if __name__ == "__main__":
    test_health()
    print("API smoke test passed.")
