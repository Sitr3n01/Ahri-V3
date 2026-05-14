from src.core.model_capabilities import (
    gemini_thinking_config_payload,
    infer_model_capabilities,
    normalize_reasoning_level,
    openrouter_reasoning_extra,
)


def test_openai_reasoning_effort_profile():
    profile = infer_model_capabilities("openai/gpt-5.1", "openrouter")

    assert profile.provider == "openrouter"
    assert profile.provider_family == "openai"
    assert profile.supports_thinking is True
    assert profile.reasoning.control == "effort"
    assert "xhigh" in profile.reasoning.levels
    assert normalize_reasoning_level("off", profile.reasoning) == "none"


def test_anthropic_openrouter_uses_reasoning_budget_tokens():
    profile = infer_model_capabilities("anthropic/claude-sonnet-4.5", "openrouter")

    assert profile.provider_family == "anthropic"
    assert profile.reasoning.control == "budget_tokens"
    assert profile.reasoning.budget_tokens["low"] >= 1024
    assert openrouter_reasoning_extra("anthropic/claude-sonnet-4.5", "high") == {
        "reasoning": {"max_tokens": 10000}
    }


def test_gemini_3_uses_thinking_level():
    profile = infer_model_capabilities("gemini-3.1-flash-lite-preview", "google_gemini")

    assert profile.provider_family == "google_gemini"
    assert profile.supports_thinking is True
    assert profile.reasoning.control == "thinking_level"
    assert gemini_thinking_config_payload("gemini-3.1-flash-lite-preview", "off") == {
        "thinking_level": "minimal"
    }


def test_gemini_25_uses_thinking_budget():
    profile = infer_model_capabilities("gemini-2.5-flash", "google_gemini")

    assert profile.reasoning.control == "thinking_budget"
    assert gemini_thinking_config_payload("gemini-2.5-flash", "high") == {
        "thinking_budget": 24576
    }
    assert gemini_thinking_config_payload("gemini-2.5-flash", "off") == {
        "thinking_budget": 0
    }


def test_chinese_reasoning_families_are_inferred():
    deepseek = infer_model_capabilities("deepseek/deepseek-r1:free", "openrouter")
    qwen = infer_model_capabilities("qwen/qwen3-235b-a22b-thinking", "openrouter")
    kimi = infer_model_capabilities("moonshotai/kimi-k2-thinking", "openrouter")

    assert deepseek.provider_family == "deepseek"
    assert deepseek.reasoning.control == "effort"
    assert qwen.provider_family == "alibaba_qwen"
    assert qwen.reasoning.control == "budget_tokens"
    assert kimi.provider_family == "moonshot_kimi"
    assert kimi.supports_thinking is True


def test_ollama_uses_boolean_reasoning_and_vision_patterns():
    profile = infer_model_capabilities(
        "llama3.2-vision:latest",
        "ollama",
        vision_patterns="vision,llava",
    )

    assert profile.provider == "ollama"
    assert profile.is_local is True
    assert profile.supports_vision is True
    assert profile.reasoning.control == "boolean"


def test_exact_model_override_updates_profile():
    profile = infer_model_capabilities(
        "provider/new-model",
        "openrouter",
        overrides={
            "models": {
                "provider/new-model": {
                    "supports_vision": True,
                    "reasoning": {
                        "control": "effort",
                        "levels": ["low", "medium", "high"],
                        "default_level": "low",
                    },
                }
            }
        },
    )

    assert profile.capability_source == "override"
    assert profile.supports_vision is True
    assert profile.reasoning.control == "effort"
    assert profile.reasoning.default_level == "low"
