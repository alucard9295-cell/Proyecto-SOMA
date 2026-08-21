from fastapi.testclient import TestClient

from soma_api.agent import architecture_plan, extract_scenario
from soma_api.main import app


def test_agent_extracts_area_and_units():
    assert extract_scenario("casa de 180 m2 en 3 apartamentos") == (180.0, 3)


def test_agent_plan_contains_financial_assumptions():
    plan = architecture_plan("Quiero transformar 90 m² en 2 viviendas")
    assert plan["inputs"]["area_m2"] == 90.0
    assert plan["inputs"]["units"] == 2
    assert plan["inputs"]["budget"] > 0
    assert plan["risks"]


def test_public_agent_returns_sse_events():
    with TestClient(app) as client:
        response = client.post(
            "/api/agui/architect",
            json={
                "messages": [
                    {"role": "user", "content": "Casa de 180 m2 en 3 apartamentos"}
                ]
            },
        )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert '"type": "CUSTOM"' in response.text
    assert '"name": "architecture_plan"' in response.text
    assert '"type": "TEXT_MESSAGE_CONTENT"' in response.text
    assert '"type": "RUN_FINISHED"' in response.text
