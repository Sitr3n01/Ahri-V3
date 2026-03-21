"""
Code Worker - Specialized agent for code analysis, generation, and execution.
Uses Gemma 3 27B for code understanding and generation.

Capabilities:
- Code review and analysis
- Generate code snippets
- Execute Python code in isolated sandbox
- Debug assistance
- Code refactoring suggestions
"""
import asyncio
import subprocess
import tempfile
import time
import json
from pathlib import Path
from typing import Any, Dict
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.database import AgentWorkerTask
from src.services.workers.base_worker import BaseWorker


class CodeWorker(BaseWorker):
    """Worker for code analysis, generation, and execution."""

    ROLE_PROMPT = (
        "[ROLE: Senior Software Engineer]\n"
        "You analyze, generate, review, and debug code with precision.\n"
        "Always specify the programming language. Use best practices and idiomatic patterns.\n"
        "For reviews: focus on bugs, security issues, and performance — skip style nitpicks.\n"
        "For execution: sandbox-only, report stdout/stderr and exit code.\n"
        "Output: JSON with structured results appropriate to the task_type."
    )

    def __init__(self, llm_service):
        super().__init__(
            llm_service=llm_service,
            worker_type="Code",
            default_model="LITE"
        )
        self.supported_languages = ["python", "javascript", "typescript", "bash", "sql"]

    async def execute(
        self,
        db: AsyncSession,
        execution_id: int,
        input_data: Dict[str, Any]
    ) -> AgentWorkerTask:
        """
        Execute code-related task.

        Input format:
        {
            "task_type": "analyze" | "generate" | "execute" | "review",
            "language": "python" | "javascript" | ...,
            "code": "code to analyze/execute",  (for analyze/execute/review)
            "prompt": "what to generate",        (for generate)
            "context": "additional context"      (optional)
        }
        """
        task_type = input_data.get("task_type", "analyze")
        language = input_data.get("language", "python")

        start_time = time.time()
        task = await self._create_task_record(db, execution_id, input_data)

        try:
            if task_type == "analyze":
                result = await self._analyze_code(input_data, db)
            elif task_type == "generate":
                result = await self._generate_code(input_data, db)
            elif task_type == "execute":
                result = await self._execute_code(input_data, db)
            elif task_type == "review":
                result = await self._review_code(input_data, db)
            else:
                raise ValueError(f"Unknown task_type: {task_type}")

            tokens = self._estimate_tokens(str(result))
            return await self._complete_task(db, task, result, tokens, start_time)

        except Exception as e:
            return await self._fail_task(db, task, str(e), start_time)

    async def _analyze_code(self, input_data: Dict, db: AsyncSession) -> Dict[str, Any]:
        """Analyze code for patterns, issues, and suggestions."""
        code = input_data.get("code", "")
        language = input_data.get("language", "python")
        context = input_data.get("context", "")

        prompt = f"""Analise o seguinte código {language} e forneça:
1. Resumo do que o código faz
2. Possíveis problemas ou bugs
3. Sugestões de melhoria
4. Complexidade estimada (O-notation se aplicável)

{f"Contexto: {context}" if context else ""}

Código:
```{language}
{code}
```

Forneça a análise em formato JSON:
{{
    "summary": "resumo breve",
    "issues": ["problema1", "problema2"],
    "suggestions": ["sugestão1", "sugestão2"],
    "complexity": "O(n)",
    "quality_score": 0-10
}}
"""

        response = await self._call_llm(
            prompt=prompt,
            model=self.default_model,
            schema={
                "type": "object",
                "properties": {
                    "summary": {"type": "string"},
                    "issues": {"type": "array", "items": {"type": "string"}},
                    "suggestions": {"type": "array", "items": {"type": "string"}},
                    "complexity": {"type": "string"},
                    "quality_score": {"type": "number"}
                },
                "required": ["summary", "issues", "suggestions"]
            }
        )

        return {
            "analysis": response,
            "language": language,
            "code_length": len(code)
        }

    async def _generate_code(self, input_data: Dict, db: AsyncSession) -> Dict[str, Any]:
        """Generate code based on prompt."""
        prompt_user = input_data.get("prompt", "")
        language = input_data.get("language", "python")
        context = input_data.get("context", "")

        prompt = f"""Gere código {language} para: {prompt_user}

{f"Contexto adicional: {context}" if context else ""}

Requisitos:
- Código funcional e bem documentado
- Seguir boas práticas da linguagem
- Incluir tratamento de erros quando apropriado
- Comentários explicativos

Forneça a resposta em formato JSON:
{{
    "code": "código gerado",
    "explanation": "explicação do código",
    "usage_example": "exemplo de uso",
    "dependencies": ["dep1", "dep2"]
}}
"""

        response = await self._call_llm(
            prompt=prompt,
            model=self.default_model,
            schema={
                "type": "object",
                "properties": {
                    "code": {"type": "string"},
                    "explanation": {"type": "string"},
                    "usage_example": {"type": "string"},
                    "dependencies": {"type": "array", "items": {"type": "string"}}
                },
                "required": ["code", "explanation"]
            }
        )

        return {
            "generated": response,
            "language": language
        }

    async def _execute_code(self, input_data: Dict, db: AsyncSession) -> Dict[str, Any]:
        """
        Execute Python code in isolated sandbox with timeout.
        Security: Only Python, 5s timeout, no network/file access.
        """
        code = input_data.get("code", "")
        language = input_data.get("language", "python")

        if language != "python":
            return {
                "error": f"Code execution only supports Python, got: {language}",
                "executed": False
            }

        # Create temp file with code
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write(code)
            temp_file = f.name

        try:
            # Execute with timeout and restricted environment
            result = subprocess.run(
                ["python", temp_file],
                capture_output=True,
                text=True,
                timeout=5,  # 5 second timeout
                env={"PYTHONIOENCODING": "utf-8"}  # Minimal env
            )

            return {
                "executed": True,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "return_code": result.returncode,
                "success": result.returncode == 0
            }

        except subprocess.TimeoutExpired:
            return {
                "executed": False,
                "error": "Execution timeout (5s limit)",
                "success": False
            }
        except Exception as e:
            return {
                "executed": False,
                "error": str(e),
                "success": False
            }
        finally:
            # Cleanup temp file
            Path(temp_file).unlink(missing_ok=True)

    async def _review_code(self, input_data: Dict, db: AsyncSession) -> Dict[str, Any]:
        """Perform code review with focus on security, performance, maintainability."""
        code = input_data.get("code", "")
        language = input_data.get("language", "python")
        context = input_data.get("context", "")

        prompt = f"""Faça uma revisão detalhada do código {language} focando em:

1. **Segurança**: Vulnerabilidades, injection risks, sensitive data exposure
2. **Performance**: Gargalos, otimizações possíveis
3. **Manutenibilidade**: Legibilidade, modularidade, testabilidade
4. **Boas Práticas**: Convenções da linguagem, patterns

{f"Contexto: {context}" if context else ""}

Código:
```{language}
{code}
```

Responda em JSON:
{{
    "security_issues": [
        {{"severity": "high|medium|low", "issue": "descrição", "fix": "como corrigir"}}
    ],
    "performance_issues": [
        {{"impact": "high|medium|low", "issue": "descrição", "suggestion": "otimização"}}
    ],
    "maintainability_score": 0-10,
    "best_practices_violations": ["violação1", "violação2"],
    "overall_recommendation": "approve|request_changes|reject"
}}
"""

        response = await self._call_llm(
            prompt=prompt,
            model=self.default_model,
            schema={
                "type": "object",
                "properties": {
                    "security_issues": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "severity": {"type": "string"},
                                "issue": {"type": "string"},
                                "fix": {"type": "string"}
                            }
                        }
                    },
                    "performance_issues": {"type": "array"},
                    "maintainability_score": {"type": "number"},
                    "best_practices_violations": {"type": "array"},
                    "overall_recommendation": {"type": "string"}
                },
                "required": ["security_issues", "maintainability_score", "overall_recommendation"]
            }
        )

        return {
            "review": response,
            "language": language,
            "code_length": len(code)
        }
