"""
Memory Analyzer - Analise incremental e smart save de memorias.
Portar de AIEngine.process_smart_save() e incremental_memory_update().
(brain.py linhas 880-1014)
"""
import json
import re
import logging
from datetime import date
from typing import Optional

from src.core.llm_clients import GeminiClient
from src.config import get_settings

logger = logging.getLogger("ahri.memory_analyzer")


def _clean_json_text(text: str) -> str:
    """Limpeza robusta para extrair JSON de respostas LLM."""
    if not text:
        return "{}"
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        return text[start : end + 1]
    return text.strip()


def _get_rest_client() -> Optional[GeminiClient]:
    """Cria um cliente REST para operacoes de background."""
    settings = get_settings()
    key = settings.memory_key
    if not key:
        return None
    return GeminiClient(key, "gemini-3.1-flash-lite")


def analyze_incremental(user_msg: str, ai_msg: str, current_profile: dict) -> Optional[dict]:
    """
    Analisa uma interacao e retorna atualizacoes para o perfil.
    Retorna dict com 'action', 'key', 'value', 'fact' ou None.
    """
    client = _get_rest_client()
    if not client:
        return None

    prompt = f"""
    [TAREFA: MEMORY WATCHER - STRICT MODE]
    Analise a interacao. Identifique fatos PERMANENTES ou IMPORTANTES.
    Ignore cumprimentos, piadas, ou comentarios casuais.

    USUARIO: "{user_msg}"
    IA: "{ai_msg}"

    CRITERIOS:
    - UPDATE_ATTR: Apenas para dados biograficos (Idade, Profissao, Local, Gosto especifico).
    - ADD_FACT: Apenas para eventos de vida ou aprendizados tecnicos.
    - IGNORE: Todo o resto (Oi, Tudo bem, Hahaha, Concordo).

    Retorne APENAS JSON:
    {{
        "action": "UPDATE_ATTR" | "ADD_FACT" | "IGNORE",
        "key": "...", "value": "...", "fact": "..."
    }}
    """

    resp_text = client.generate_content_rest(prompt)
    if not resp_text:
        return None

    try:
        return json.loads(_clean_json_text(resp_text))
    except Exception as e:
        logger.error(f"Incremental parse error: {e}")
        return None


def process_smart_save(messages: list[dict], current_profile: dict) -> tuple[dict, str]:
    """
    Analisa batch de mensagens e retorna perfil atualizado + summary.
    """
    if not messages:
        return current_profile, "Nada a salvar."

    client = _get_rest_client()
    if not client:
        return current_profile, "API unavailable."

    logger.info("Starting smart save (REST)...")

    chat_text = "\n".join(
        [f"{m['role']}: {m['content']}" for m in messages if isinstance(m.get("content"), str)]
    )

    prompt = f"""
    [SYSTEM: MEMORY OPTIMIZER]
    Analise o chat recente e identifique NOVOS dados para o perfil do usuario.

    PERFIL ATUAL: {json.dumps(current_profile, ensure_ascii=False)}
    CHAT RECENTE: {chat_text[-4000:]}

    INSTRUCAO:
    1. Compare o Chat com o Perfil.
    2. Se houver informacoes NOVAS, gere um JSON parcial APENAS com as mudancas.
    3. Se nao houver nada relevante, retorne {{ "summary": "Sem mudancas." }}
    4. NAO retorne o perfil completo, apenas o que mudou.

    FORMATO:
    {{
        "diff": {{
            "attributes": {{ "chave": "valor" }},
            "knowledge_tracker": {{ "vocabulary_recent": ["novo_termo"] }}
        }},
        "summary": "Explicacao breve"
    }}
    """

    resp_text = client.generate_content_rest(prompt, temperature=0.0)
    if not resp_text:
        return current_profile, "API failure."

    try:
        result = json.loads(_clean_json_text(resp_text))
        updates = result.get("diff", {})
        summary = result.get("summary", "Memoria verificada.")

        has_changes = False

        if "attributes" in updates and isinstance(updates["attributes"], dict):
            if "attributes" not in current_profile:
                current_profile["attributes"] = {}
            current_profile["attributes"].update(updates["attributes"])
            has_changes = True

        if "knowledge_tracker" in updates:
            kt = updates["knowledge_tracker"]
            if "vocabulary_recent" in kt and isinstance(kt["vocabulary_recent"], list):
                if "knowledge_tracker" not in current_profile:
                    current_profile["knowledge_tracker"] = {}
                if "vocabulary_recent" not in current_profile["knowledge_tracker"]:
                    current_profile["knowledge_tracker"]["vocabulary_recent"] = []

                existing = set(str(x) for x in current_profile["knowledge_tracker"]["vocabulary_recent"])
                for item in kt["vocabulary_recent"]:
                    if str(item) not in existing:
                        current_profile["knowledge_tracker"]["vocabulary_recent"].append(item)
                        has_changes = True

        if "user_profile" in updates and isinstance(updates["user_profile"], dict):
            if "user_profile" not in current_profile:
                current_profile["user_profile"] = {}
            current_profile["user_profile"].update(updates["user_profile"])
            has_changes = True

        if has_changes:
            if "session_log" not in current_profile:
                current_profile["session_log"] = []
            current_profile["session_log"].append(f"[{date.today()}] {summary}")
            return current_profile, summary

        return current_profile, "Sem alteracoes necessarias."

    except Exception as e:
        return current_profile, f"Parse error: {e}"
