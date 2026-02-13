"""
Save Tag Parser - Detecta e processa tags [[SAVE:]] e [[AGENT:]] nas respostas.
Extraido de AIEngine (brain.py linhas 1332-1346).
"""
import re
import logging
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("ahri.parser")


@dataclass
class SaveTag:
    title: str
    content: str


@dataclass
class AgentTag:
    capability: str
    parameters: dict = field(default_factory=dict)


def extract_save_tags(text: str) -> list[SaveTag]:
    """Extrai todos os [[SAVE: Title | Content]] do texto."""
    pattern = r"\[\[SAVE:\s*(.*?)\s*\|\s*(.*?)\]\]"
    matches = re.findall(pattern, text, re.DOTALL | re.IGNORECASE)
    return [SaveTag(title=m[0].strip(), content=m[1].strip()) for m in matches]


def extract_agent_tags(text: str) -> list[AgentTag]:
    """Extrai todos os [[AGENT: capability | param=value | ...]] do texto."""
    pattern = r"\[\[AGENT:\s*(.*?)\]\]"
    matches = re.findall(pattern, text, re.DOTALL | re.IGNORECASE)

    tags = []
    for match in matches:
        parts = [p.strip() for p in match.split("|")]
        if not parts:
            continue

        capability = parts[0]
        params = {}

        for part in parts[1:]:
            if "=" in part:
                key, _, value = part.partition("=")
                params[key.strip()] = value.strip()

        tags.append(AgentTag(capability=capability, parameters=params))

    return tags


def clean_save_tags(text: str) -> str:
    """Remove todas as tags [[SAVE:...]] do texto para display."""
    return re.sub(r"\[\[SAVE:.*?\]\]", "", text, flags=re.DOTALL).strip()


def clean_agent_tags(text: str) -> str:
    """Remove todas as tags [[AGENT:...]] do texto para display."""
    return re.sub(r"\[\[AGENT:.*?\]\]", "", text, flags=re.DOTALL).strip()


def clean_all_tags(text: str) -> str:
    """Remove todas as tags especiais do texto."""
    text = clean_save_tags(text)
    text = clean_agent_tags(text)
    return text
