"""
Extended Persona Files Migration Script.
Migrates physical files from V2 to V3:
- persona.md (persona definitions)
- knowledge/*.md (episodic memory documents)
- rag_docs/*.md (vector DB documents)

Usage:
    python -m src.scripts.migrate_persona_files --v2-path "C:/Users/zegil/Documents/GitHub/Ahri V2/Ahri"
"""
import shutil
import logging
from pathlib import Path
from typing import List

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("migrate_files")


def migrate_persona_files(v2_path: str, v3_data_path: str = "data"):
    """
    Migra arquivos físicos de personas da V2 para V3.

    Estrutura V2:
    data/personas/{persona_name}/
        - persona.md
        - knowledge/*.md
        - rag_docs/*.md

    Estrutura V3:
    data/personas/{persona_name}/
        - persona.md
        - knowledge/*.md
        - rag_docs/*.md
    """
    v2_root = Path(v2_path)
    v2_personas_dir = v2_root / "data" / "personas"

    v3_root = Path(v3_data_path)
    v3_personas_dir = v3_root / "personas"

    if not v2_personas_dir.exists():
        logger.error(f"V2 personas directory not found: {v2_personas_dir}")
        return

    # Cria diretório de personas V3 se não existir
    v3_personas_dir.mkdir(parents=True, exist_ok=True)

    logger.info(f"Migrating persona files from: {v2_personas_dir}")
    logger.info(f"Target directory: {v3_personas_dir}")

    # Lista de personas
    personas: List[str] = []
    for persona_dir in sorted(v2_personas_dir.iterdir()):
        if not persona_dir.is_dir():
            continue
        personas.append(persona_dir.name)

    logger.info(f"Found {len(personas)} personas: {', '.join(personas)}")

    for persona_name in personas:
        logger.info(f"\n{'='*60}")
        logger.info(f"Migrating persona: {persona_name}")
        logger.info(f"{'='*60}")

        v2_persona_dir = v2_personas_dir / persona_name
        v3_persona_dir = v3_personas_dir / persona_name

        # Cria diretório da persona em V3
        v3_persona_dir.mkdir(parents=True, exist_ok=True)

        # =====================================================================
        # 1. persona.md
        # =====================================================================
        v2_persona_md = v2_persona_dir / "persona.md"
        v3_persona_md = v3_persona_dir / "persona.md"

        if v2_persona_md.exists():
            if not v3_persona_md.exists():
                shutil.copy2(v2_persona_md, v3_persona_md)
                logger.info(f"  ✓ persona.md migrated")
            else:
                logger.info(f"  → persona.md already exists, skipping")
        else:
            logger.warning(f"  ⚠ persona.md not found in V2")

        # =====================================================================
        # 2. knowledge/*.md (Episodic Memory)
        # =====================================================================
        v2_knowledge_dir = v2_persona_dir / "knowledge"
        v3_knowledge_dir = v3_persona_dir / "knowledge"

        if v2_knowledge_dir.exists() and v2_knowledge_dir.is_dir():
            v3_knowledge_dir.mkdir(parents=True, exist_ok=True)

            knowledge_files = list(v2_knowledge_dir.glob("*.md"))
            migrated_count = 0
            skipped_count = 0

            for knowledge_file in knowledge_files:
                v3_target = v3_knowledge_dir / knowledge_file.name

                if not v3_target.exists():
                    shutil.copy2(knowledge_file, v3_target)
                    migrated_count += 1
                else:
                    skipped_count += 1

            logger.info(f"  ✓ knowledge/ migrated: {migrated_count} files (skipped {skipped_count} existing)")
        else:
            logger.info(f"  → knowledge/ directory not found")

        # =====================================================================
        # 3. rag_docs/*.md (Vector DB Documents)
        # =====================================================================
        v2_rag_dir = v2_persona_dir / "rag_docs"
        v3_rag_dir = v3_persona_dir / "rag_docs"

        if v2_rag_dir.exists() and v2_rag_dir.is_dir():
            v3_rag_dir.mkdir(parents=True, exist_ok=True)

            # Suporta múltiplas extensões (md, txt, pdf, etc)
            rag_files = list(v2_rag_dir.glob("*.*"))
            migrated_count = 0
            skipped_count = 0

            for rag_file in rag_files:
                # Ignora .lock files
                if rag_file.suffix == ".lock":
                    continue

                v3_target = v3_rag_dir / rag_file.name

                if not v3_target.exists():
                    shutil.copy2(rag_file, v3_target)
                    migrated_count += 1
                else:
                    skipped_count += 1

            logger.info(f"  ✓ rag_docs/ migrated: {migrated_count} files (skipped {skipped_count} existing)")
        else:
            logger.info(f"  → rag_docs/ directory not found")

    logger.info(f"\n{'='*60}")
    logger.info("Persona files migration complete!")
    logger.info(f"{'='*60}")


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Migrate Ahri V2 persona files to V3")
    parser.add_argument(
        "--v2-path",
        default=r"C:\Users\zegil\Documents\GitHub\Ahri V2\Ahri",
        help="Path to Ahri V2 root directory",
    )
    parser.add_argument(
        "--v3-data",
        default="data",
        help="Path to V3 data directory",
    )

    args = parser.parse_args()
    migrate_persona_files(args.v2_path, args.v3_data)


if __name__ == "__main__":
    main()
