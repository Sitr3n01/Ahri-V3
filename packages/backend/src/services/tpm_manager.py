"""
TPM (Tokens Per Minute) Manager - Rate limiting for Google AI Studio and other LLM APIs.

Manages token quotas to stay within provider limits (e.g., Google AI Studio 15k TPM free tier).
"""
import time
import hashlib
import threading
from collections import deque
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.database import TPMQuota


class TPMManager:
    """
    Manages tokens-per-minute (TPM) quotas for LLM API calls.

    Uses sliding window algorithm to track token usage over 60-second windows.
    Supports multiple providers and models with per-API-key tracking.

    Thread-safe: Uses threading.Lock to prevent race conditions in concurrent requests.
    """

    def __init__(self, limit_tpm: int = 15000, window_seconds: int = 60):
        """
        Args:
            limit_tpm: Maximum tokens allowed per minute (default: 15000 for Google AI Studio)
            window_seconds: Time window for rate limiting in seconds (default: 60)
        """
        self.limit_tpm = limit_tpm
        self.window_seconds = window_seconds

        # In-memory log for fast rate limiting (process-local)
        # Format: [(timestamp, token_count)]
        self.token_log: deque[tuple[float, int]] = deque()

        # Thread-safety lock for concurrent access
        self._lock = threading.Lock()

    def _hash_api_key(self, api_key: str) -> str:
        """Hash API key for privacy (SHA256)."""
        return hashlib.sha256(api_key.encode()).hexdigest()

    def request_tokens(self, estimated_tokens: int) -> float:
        """
        Check if token request can be fulfilled within quota.

        Thread-safe: Acquires lock to prevent race conditions.

        Args:
            estimated_tokens: Number of tokens needed for this request

        Returns:
            wait_seconds: Seconds to wait before retrying (0 if request can proceed)
        """
        with self._lock:
            now = time.time()

            # Prune old entries outside sliding window
            while self.token_log and self.token_log[0][0] < now - self.window_seconds:
                self.token_log.popleft()

            # Calculate current usage in window
            current_usage = sum(count for _, count in self.token_log)

            # Check if adding this request exceeds quota
            if current_usage + estimated_tokens > self.limit_tpm:
                # Calculate wait time until oldest request drops out of window
                if self.token_log:
                    oldest_timestamp = self.token_log[0][0]
                    wait_seconds = max(0, (oldest_timestamp + self.window_seconds) - now)
                    return wait_seconds
                return 0.0

            # Request approved - add to log
            self.token_log.append((now, estimated_tokens))
            return 0.0

    async def record_usage(
        self,
        db: AsyncSession,
        api_key: str,
        provider: str,
        model: str,
        tokens_used: int
    ) -> None:
        """
        Record token usage in database for long-term tracking and analytics.

        Args:
            db: Database session
            api_key: API key used (will be hashed)
            provider: Provider name (google_ai_studio, deepinfra, ollama)
            model: Model name (gemma-3-4b, gemma-3-12b, etc.)
            tokens_used: Number of tokens consumed
        """
        api_key_hash = self._hash_api_key(api_key)
        now = datetime.utcnow()
        window_start = now.replace(second=0, microsecond=0)  # Round to minute
        window_end = window_start + timedelta(minutes=1)

        # Check if record exists for this minute window
        stmt = select(TPMQuota).where(
            and_(
                TPMQuota.api_key_hash == api_key_hash,
                TPMQuota.provider == provider,
                TPMQuota.model == model,
                TPMQuota.window_start == window_start
            )
        )
        result = await db.execute(stmt)
        quota_record = result.scalar_one_or_none()

        if quota_record:
            # Update existing record
            quota_record.tokens_used += tokens_used
        else:
            # Create new record
            quota_record = TPMQuota(
                api_key_hash=api_key_hash,
                provider=provider,
                model=model,
                tokens_used=tokens_used,
                window_start=window_start,
                window_end=window_end
            )
            db.add(quota_record)

        await db.commit()

    async def get_usage_stats(
        self,
        db: AsyncSession,
        api_key: str,
        provider: str,
        model: str,
        hours: int = 1
    ) -> dict:
        """
        Get token usage statistics for the last N hours.

        Returns:
            {
                "total_tokens": int,
                "avg_tpm": float,
                "peak_tpm": int,
                "quota_limit": int
            }
        """
        api_key_hash = self._hash_api_key(api_key)
        cutoff = datetime.utcnow() - timedelta(hours=hours)

        stmt = select(TPMQuota).where(
            and_(
                TPMQuota.api_key_hash == api_key_hash,
                TPMQuota.provider == provider,
                TPMQuota.model == model,
                TPMQuota.window_start >= cutoff
            )
        )
        result = await db.execute(stmt)
        records = result.scalars().all()

        total_tokens = sum(r.tokens_used for r in records)
        peak_tpm = max((r.tokens_used for r in records), default=0)
        avg_tpm = total_tokens / (hours * 60) if records else 0

        return {
            "total_tokens": total_tokens,
            "avg_tpm": round(avg_tpm, 2),
            "peak_tpm": peak_tpm,
            "quota_limit": self.limit_tpm
        }

    def estimate_tokens(self, text: str) -> int:
        """
        Estimate token count from text using simple heuristic.

        Rule of thumb: 1 token ≈ 4 characters for English text.
        This is conservative (overestimates) to stay under quota.

        Args:
            text: Input text to estimate

        Returns:
            Estimated token count
        """
        return len(text) // 4 + 10  # Add 10 token buffer for safety

    def get_current_usage(self) -> int:
        """Get current token usage in the sliding window. Thread-safe."""
        with self._lock:
            now = time.time()

            # Prune old entries
            while self.token_log and self.token_log[0][0] < now - self.window_seconds:
                self.token_log.popleft()

            return sum(count for _, count in self.token_log)

    def get_remaining_quota(self) -> int:
        """Get remaining tokens available in current window. Thread-safe."""
        return max(0, self.limit_tpm - self.get_current_usage())

    def get_status(self) -> dict:
        """
        Get current TPM status for UI display.

        Thread-safe: All methods called use locks internally.

        Returns:
            {
                "tokens_used_window": int,
                "tokens_remaining": int,
                "limit_tpm": int,
                "utilization_percent": float,
                "window_seconds": int
            }
        """
        tokens_used = self.get_current_usage()
        tokens_remaining = self.get_remaining_quota()

        return {
            "tokens_used_window": tokens_used,
            "tokens_remaining": tokens_remaining,
            "limit_tpm": self.limit_tpm,
            "utilization_percent": round((tokens_used / self.limit_tpm) * 100, 2) if self.limit_tpm > 0 else 0,
            "window_seconds": self.window_seconds
        }
