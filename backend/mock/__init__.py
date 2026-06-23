import json, pathlib

_FIXTURES = pathlib.Path(__file__).parent.parent / "fixtures"

def get_fixture(name: str) -> dict:
    return json.loads((_FIXTURES / f"{name}.json").read_text())
