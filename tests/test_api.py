from fastapi.testclient import TestClient
from aeroflight.api import app

client = TestClient(app)


def test_presets_run_in_common_engine():
    presets = client.get('/api/presets').json()
    assert len(presets) == 2
    for p in presets:
        result = client.post('/api/simulate', json={k:v for k,v in p.items() if k != 'id'})
        assert result.status_code == 200
        body = result.json()
        assert len(body['rows']) > 2
        assert body['provenance']['source'] == 'engineering_approximation'
        assert body['status'] in ('ground','duration','envelope')


def test_invalid_requests_rejected():
    for payload in [{'aircraft': {'mass': 0}}, {'aircraft': {'oops': 1}}, {'conditions': {'speed': -1}},
                    {'solver': {'max_step': 0}}, {'aircraft': {'thrust_curve': [[10,2],[0,3]]}},
                    {'aircraft': {'mass_mode': 'components', 'components': []}}]:
        assert client.post('/api/simulate', json=payload).status_code == 422


def test_source_download_contains_local_app_and_tests():
    from io import BytesIO
    from zipfile import ZipFile
    response = client.get('/api/source.zip')
    assert response.status_code == 200
    with ZipFile(BytesIO(response.content)) as archive:
        names = archive.namelist()
        assert 'flight-simulator/README.md' in names
        assert 'flight-simulator/run.py' in names
        assert 'flight-simulator/tests/test_physics.py' in names
        assert not any('node_modules' in name or '__pycache__' in name for name in names)
    assert '起動' in client.get('/api/readme').text
