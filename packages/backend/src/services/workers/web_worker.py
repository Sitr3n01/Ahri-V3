"""
Web Worker - Specialized agent for web content fetching and scraping.
Uses Gemma 3 4B for content summarization and extraction.

Capabilities:
- Fetch URL content
- Extract main text from HTML
- Summarize web pages
- Extract structured data (links, images, metadata)
"""
import requests
from bs4 import BeautifulSoup
from typing import Any, Dict, List
from sqlalchemy.ext.asyncio import AsyncSession
from urllib.parse import urljoin, urlparse

from src.models.database import AgentWorkerTask
from src.services.workers.base_worker import BaseWorker


class WebWorker(BaseWorker):
    """Worker for web content fetching and scraping."""

    def __init__(self, llm_service):
        super().__init__(
            llm_service=llm_service,
            worker_type="Web",
            default_model="GOOGLE"
        )
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }

    async def execute(
        self,
        db: AsyncSession,
        execution_id: int,
        input_data: Dict[str, Any]
    ) -> AgentWorkerTask:
        """
        Fetch and process web content.

        Input format:
        {
            "url": "https://example.com",
            "action": "fetch" | "summarize" | "extract_links" | "extract_data",
            "extract_schema": {...} (optional, for structured extraction)
        }
        """
        task = await self._create_task_record(db, execution_id, input_data)

        try:
            url = input_data.get("url", "")
            action = input_data.get("action", "fetch")

            # Fetch page
            page_data = await self._fetch_page(url)

            if page_data.get("error"):
                task.output_data = page_data
                task.status = "failed"
                task.error = page_data["error"]
                await db.commit()
                await db.refresh(task)
                return task

            # Process based on action
            if action == "summarize":
                result = await self._summarize_page(page_data, db)
            elif action == "extract_links":
                result = await self._extract_links(page_data, url)
            elif action == "extract_data":
                result = await self._extract_structured_data(page_data, input_data, db)
            else:  # fetch
                result = page_data

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

    async def _fetch_page(self, url: str) -> Dict[str, Any]:
        """Fetch and parse HTML page."""
        try:
            response = requests.get(url, headers=self.headers, timeout=15)
            response.raise_for_status()

            soup = BeautifulSoup(response.text, 'html.parser')

            # Remove script and style elements
            for script in soup(["script", "style"]):
                script.decompose()

            # Get text
            text = soup.get_text()

            # Clean up whitespace
            lines = (line.strip() for line in text.splitlines())
            chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
            text = '\n'.join(chunk for chunk in chunks if chunk)

            # Get metadata
            title = soup.find('title')
            title_text = title.string if title else ""

            meta_description = soup.find('meta', attrs={'name': 'description'})
            description = meta_description.get('content', '') if meta_description else ""

            return {
                "url": url,
                "title": title_text,
                "description": description,
                "text": text,
                "text_length": len(text),
                "status_code": response.status_code,
                "html": response.text
            }

        except requests.RequestException as e:
            return {"error": f"Failed to fetch URL: {str(e)}"}

    async def _summarize_page(self, page_data: Dict, db: AsyncSession) -> Dict[str, Any]:
        """Summarize web page content using LLM."""
        text = page_data.get("text", "")
        title = page_data.get("title", "")

        # Limit text to avoid token overflow (first 8000 chars)
        text_sample = text[:8000]

        prompt = f"""Resuma o conteúdo da seguinte página web:

Título: {title}

Conteúdo:
{text_sample}

Forneça um resumo estruturado em JSON:
{{
    "summary": "resumo conciso em 2-3 parágrafos",
    "key_points": ["ponto1", "ponto2", "ponto3"],
    "main_topic": "tópico principal",
    "sentiment": "positive|neutral|negative",
    "is_article": true/false
}}
"""

        response = await self._call_llm(
            prompt=prompt,
            model="GOOGLE",
            schema={
                "type": "object",
                "properties": {
                    "summary": {"type": "string"},
                    "key_points": {"type": "array", "items": {"type": "string"}},
                    "main_topic": {"type": "string"},
                    "sentiment": {"type": "string"},
                    "is_article": {"type": "boolean"}
                },
                "required": ["summary", "key_points", "main_topic"]
            }
        )

        return {
            **page_data,
            "analysis": response
        }

    async def _extract_links(self, page_data: Dict, base_url: str) -> Dict[str, Any]:
        """Extract all links from page."""
        html = page_data.get("html", "")
        soup = BeautifulSoup(html, 'html.parser')

        links = []
        for a_tag in soup.find_all('a', href=True):
            href = a_tag['href']
            absolute_url = urljoin(base_url, href)
            text = a_tag.get_text(strip=True)

            links.append({
                "url": absolute_url,
                "text": text,
                "is_external": urlparse(absolute_url).netloc != urlparse(base_url).netloc
            })

        # Categorize links
        internal = [l for l in links if not l["is_external"]]
        external = [l for l in links if l["is_external"]]

        return {
            "url": page_data.get("url"),
            "title": page_data.get("title"),
            "links": {
                "all": links,
                "internal": internal,
                "external": external,
                "count": {
                    "total": len(links),
                    "internal": len(internal),
                    "external": len(external)
                }
            }
        }

    async def _extract_structured_data(
        self,
        page_data: Dict,
        input_data: Dict,
        db: AsyncSession
    ) -> Dict[str, Any]:
        """Extract structured data based on schema using LLM."""
        text = page_data.get("text", "")[:8000]
        extract_schema = input_data.get("extract_schema", {})

        prompt = f"""Extraia os seguintes dados estruturados da página web:

Schema desejado: {extract_schema}

Conteúdo da página:
{text}

Retorne os dados extraídos no formato JSON especificado pelo schema.
Se algum campo não for encontrado, use null.
"""

        response = await self._call_llm(
            prompt=prompt,
            model="GOOGLE",
            schema=extract_schema if extract_schema else None
        )

        return {
            "url": page_data.get("url"),
            "extracted_data": response
        }
