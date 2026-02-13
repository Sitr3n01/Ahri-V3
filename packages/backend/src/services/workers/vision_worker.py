"""
Vision Worker - Specialized agent for image analysis and OCR.
Uses Gemma 3 12B (multimodal variant when available) or Gemini Flash for vision tasks.

Capabilities:
- Image analysis and description
- Object detection
- OCR (text extraction from images)
- Image comparison
- Visual question answering
"""
import base64
from pathlib import Path
from typing import Any, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from PIL import Image
import io

from src.models.database import AgentWorkerTask
from src.services.workers.base_worker import BaseWorker


class VisionWorker(BaseWorker):
    """Worker for vision and image analysis tasks."""

    def __init__(self, llm_service):
        super().__init__(
            llm_service=llm_service,
            worker_type="Vision",
            default_model="PRO"
        )

    async def execute(
        self,
        db: AsyncSession,
        execution_id: int,
        input_data: Dict[str, Any]
    ) -> AgentWorkerTask:
        """
        Analyze image.

        Input format:
        {
            "task_type": "describe" | "ocr" | "detect" | "qa",
            "image_path": "path/to/image.png",  (or)
            "image_base64": "base64_encoded_image",
            "question": "what's in this image?",  (for qa)
            "detect_objects": ["person", "car"]   (for detect)
        }
        """
        task = await self._create_task_record(db, execution_id, input_data)

        try:
            # Load image
            image_data = await self._load_image(input_data)
            if image_data.get("error"):
                task.output_data = image_data
                task.status = "failed"
                task.error = image_data["error"]
                await db.commit()
                await db.refresh(task)
                return task

            task_type = input_data.get("task_type", "describe")

            if task_type == "describe":
                result = await self._describe_image(image_data, db)
            elif task_type == "ocr":
                result = await self._extract_text(image_data, db)
            elif task_type == "detect":
                result = await self._detect_objects(image_data, input_data, db)
            elif task_type == "qa":
                result = await self._visual_qa(image_data, input_data, db)
            else:
                raise ValueError(f"Unknown task_type: {task_type}")

            task.output_data = result
            task.status = "completed"
            await db.commit()
            await db.refresh(task)
            return task

        except Exception as e:
            task.status = "failed"
            task.error = str(e)
            await db.commit()
            await db.refresh(task)
            return task

    async def _load_image(self, input_data: Dict) -> Dict[str, Any]:
        """Load and validate image."""
        try:
            # Try path first
            if "image_path" in input_data:
                path = Path(input_data["image_path"])
                if not path.exists():
                    return {"error": f"Image not found: {path}"}

                with open(path, "rb") as f:
                    image_bytes = f.read()
                    image_base64 = base64.b64encode(image_bytes).decode('utf-8')

                # Get image info
                img = Image.open(path)
                width, height = img.size
                format_name = img.format

            # Try base64
            elif "image_base64" in input_data:
                image_base64 = input_data["image_base64"]
                image_bytes = base64.b64decode(image_base64)

                img = Image.open(io.BytesIO(image_bytes))
                width, height = img.size
                format_name = img.format

            else:
                return {"error": "No image provided (need image_path or image_base64)"}

            return {
                "image_base64": image_base64,
                "width": width,
                "height": height,
                "format": format_name,
                "size_kb": len(image_bytes) / 1024
            }

        except Exception as e:
            return {"error": f"Failed to load image: {str(e)}"}

    async def _describe_image(self, image_data: Dict, db: AsyncSession) -> Dict[str, Any]:
        """Generate detailed description of image."""
        # NOTE: Gemma 3 12B doesn't have native vision yet (as of Jan 2025)
        # Using Gemini Flash as fallback for vision tasks
        # When Gemma multimodal is available, switch to gemini/gemma-3-12b-it-vision

        prompt = """Descreva esta imagem em detalhes:

1. **Cena principal**: O que está acontecendo
2. **Objetos visíveis**: Liste os principais objetos
3. **Pessoas** (se houver): Quantas, o que estão fazendo
4. **Cores dominantes**: Paleta de cores
5. **Contexto**: Onde parece que a foto foi tirada
6. **Mood/Atmosfera**: Sentimento transmitido

Forneça em JSON:
{
    "main_subject": "assunto principal",
    "description": "descrição detalhada",
    "objects": ["obj1", "obj2"],
    "colors": ["cor1", "cor2"],
    "setting": "local/contexto",
    "mood": "emoção/atmosfera",
    "has_people": true/false,
    "is_photo": true/false
}
"""

        # Use Gemini Flash for vision (has multimodal support)
        response = await self._call_llm_with_image(
            prompt=prompt,
            image_base64=image_data["image_base64"],
            model="PRO",
            schema={
                "type": "object",
                "properties": {
                    "main_subject": {"type": "string"},
                    "description": {"type": "string"},
                    "objects": {"type": "array", "items": {"type": "string"}},
                    "colors": {"type": "array", "items": {"type": "string"}},
                    "setting": {"type": "string"},
                    "mood": {"type": "string"},
                    "has_people": {"type": "boolean"},
                    "is_photo": {"type": "boolean"}
                },
                "required": ["main_subject", "description"]
            }
        )

        return {
            "image_info": {
                "width": image_data["width"],
                "height": image_data["height"],
                "format": image_data["format"]
            },
            "analysis": response
        }

    async def _extract_text(self, image_data: Dict, db: AsyncSession) -> Dict[str, Any]:
        """Extract text from image (OCR)."""
        prompt = """Extraia TODO o texto visível nesta imagem.

Retorne em JSON:
{
    "text": "texto completo extraído",
    "has_text": true/false,
    "language": "idioma detectado",
    "text_blocks": ["bloco1", "bloco2"],
    "confidence": 0.0-1.0
}

Se não houver texto, retorne has_text: false.
"""

        response = await self._call_llm_with_image(
            prompt=prompt,
            image_base64=image_data["image_base64"],
            model="PRO",
            schema={
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "has_text": {"type": "boolean"},
                    "language": {"type": "string"},
                    "text_blocks": {"type": "array", "items": {"type": "string"}},
                    "confidence": {"type": "number"}
                },
                "required": ["text", "has_text"]
            }
        )

        return {
            "ocr_result": response,
            "image_format": image_data["format"]
        }

    async def _detect_objects(self, image_data: Dict, input_data: Dict, db: AsyncSession) -> Dict[str, Any]:
        """Detect specific objects in image."""
        objects_to_detect = input_data.get("detect_objects", [])

        if objects_to_detect:
            obj_list = ", ".join(objects_to_detect)
            prompt = f"""Detecte os seguintes objetos na imagem: {obj_list}

Para cada objeto, indique se está presente e onde (posição aproximada).

Retorne em JSON:
{{
    "detections": [
        {{
            "object": "nome do objeto",
            "present": true/false,
            "count": número de instâncias,
            "location": "descrição da posição",
            "confidence": 0.0-1.0
        }}
    ]
}}
"""
        else:
            prompt = """Detecte e liste todos os objetos principais visíveis nesta imagem.

Retorne em JSON:
{
    "detections": [
        {
            "object": "nome do objeto",
            "count": número,
            "location": "posição",
            "confidence": 0.0-1.0
        }
    ]
}
"""

        response = await self._call_llm_with_image(
            prompt=prompt,
            image_base64=image_data["image_base64"],
            model="gemini-2.5-flash"
        )

        return {
            "requested_objects": objects_to_detect,
            "detection_result": response
        }

    async def _visual_qa(self, image_data: Dict, input_data: Dict, db: AsyncSession) -> Dict[str, Any]:
        """Answer question about image."""
        question = input_data.get("question", "O que você vê nesta imagem?")

        prompt = f"""Responda a seguinte pergunta sobre a imagem:

Pergunta: {question}

Forneça uma resposta detalhada e precisa em JSON:
{{
    "answer": "resposta clara e detalhada",
    "confidence": 0.0-1.0,
    "reasoning": "explicação do raciocínio",
    "relevant_details": ["detalhe1", "detalhe2"]
}}
"""

        response = await self._call_llm_with_image(
            prompt=prompt,
            image_base64=image_data["image_base64"],
            model="PRO",
            schema={
                "type": "object",
                "properties": {
                    "answer": {"type": "string"},
                    "confidence": {"type": "number"},
                    "reasoning": {"type": "string"},
                    "relevant_details": {"type": "array", "items": {"type": "string"}}
                },
                "required": ["answer", "confidence"]
            }
        )

        return {
            "question": question,
            "result": response
        }

    async def _call_llm_with_image(
        self,
        prompt: str,
        image_base64: str,
        model: str,
        schema: Dict = None
    ) -> Dict[str, Any]:
        """
        Call LLM with image input.
        This is a placeholder - actual implementation depends on llm_service API.
        """
        # TODO: Implement multimodal LLM call in llm_service
        # For now, return mock structure
        # In real implementation, this would call:
        # return await self.llm.generate_with_image(prompt, image_base64, model, schema)

        # Temporary: call text-only LLM with note that image analysis is pending
        return await self._call_llm(
            prompt=f"{prompt}\n\n[NOTE: Image analysis with base64: {image_base64[:50]}...]",
            model=model,
            schema=schema
        )
