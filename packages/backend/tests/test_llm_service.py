from src.services.llm_service import create_llm_service


def test_create_llm_service_returns_isolated_model_state():
    first = create_llm_service("LITE")
    second = create_llm_service("LOCAL")

    assert first is not second
    assert first.mode == "LITE"
    assert second.mode == "LOCAL"

    second.set_mode("DEEPSEEK")

    assert first.mode == "LITE"
    assert second.mode == "DEEPSEEK"
