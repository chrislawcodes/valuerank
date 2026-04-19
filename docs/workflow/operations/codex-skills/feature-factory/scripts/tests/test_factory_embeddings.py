import inspect
import importlib.util
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT_DIR = Path(__file__).resolve().parents[1]

EMBEDDINGS_SPEC = importlib.util.spec_from_file_location("factory_embeddings", SCRIPT_DIR / "factory_embeddings.py")
assert EMBEDDINGS_SPEC and EMBEDDINGS_SPEC.loader
FACTORY_EMBEDDINGS = importlib.util.module_from_spec(EMBEDDINGS_SPEC)
sys.modules[EMBEDDINGS_SPEC.name] = FACTORY_EMBEDDINGS
EMBEDDINGS_SPEC.loader.exec_module(FACTORY_EMBEDDINGS)


class FactoryEmbeddingsTests(unittest.TestCase):
    def setUp(self) -> None:
        FACTORY_EMBEDDINGS._FALLBACK_LOGGED = False

    def test_cosine_similarity_signature(self) -> None:
        signature = inspect.signature(FACTORY_EMBEDDINGS.cosine_similarity)
        self.assertEqual(list(signature.parameters), ["text_a", "text_b"])
        self.assertIn(str(signature.return_annotation), {"float", "<class 'float'>"})

    def test_jaccard_fallback_similarity(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            score = FACTORY_EMBEDDINGS.cosine_similarity("The quick brown fox", "quick fox jumps")

        self.assertAlmostEqual(score, 0.5)

    def test_no_openai_key_path_uses_fallback_and_logs_once(self) -> None:
        with patch.dict(os.environ, {}, clear=True), self.assertLogs(FACTORY_EMBEDDINGS.__name__, level="INFO") as logs:
            first = FACTORY_EMBEDDINGS.cosine_similarity("alpha beta", "beta gamma")
            second = FACTORY_EMBEDDINGS.cosine_similarity("alpha beta", "beta gamma")

        self.assertAlmostEqual(first, 1 / 3)
        self.assertEqual(second, first)
        self.assertEqual(len(logs.output), 1)
        self.assertIn("OpenAI embeddings unavailable; using degraded Jaccard similarity fallback", logs.output[0])


if __name__ == "__main__":
    unittest.main()
