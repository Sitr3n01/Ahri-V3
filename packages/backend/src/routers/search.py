"""
Search: web search via Google Custom Search Engine.
"""
from fastapi import APIRouter

from src.dependencies import AuthDep, DbDep
from src.models.schemas import SearchRequest, SearchResponse, SearchResult
from src.services.search_service import SearchService

router = APIRouter()


@router.post("", response_model=SearchResponse)
async def web_search(request: SearchRequest, auth: AuthDep, db: DbDep):
    """Realiza uma busca na web."""
    svc = SearchService(db)
    data = await svc.search(request.query, request.max_results)

    return SearchResponse(
        results=[
            SearchResult(
                title=r["title"],
                link=r["link"],
                snippet=r["snippet"],
            )
            for r in data.get("results", [])
        ],
        remaining_quota=data.get("remaining_quota", 0),
    )
