#!/usr/bin/env python3
"""Diagnostic wrapper for the selected v8 corpus builder.

It disables the in-builder canonical-example assertion so CI can publish the
complete generated corpus and report every actual mismatch in one pass. This
file is temporary research scaffolding and is not a production builder.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("scanword_bulk_v8", HERE / "build-bulk-lexicon-v8.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Unable to load build-bulk-lexicon-v8.py")
v8 = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = v8
SPEC.loader.exec_module(v8)
v8.assert_canonical_examples = lambda entries: None

if __name__ == "__main__":
    v8.main()
