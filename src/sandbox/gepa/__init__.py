"""
GEPA integration for iofold platform.

This module provides the adapter for running GEPA optimization with iofold's
agent execution infrastructure.
"""

from .iofold_adapter import IofoldGEPAAdapter, DataInst, EvaluationBatch

__all__ = ["IofoldGEPAAdapter", "DataInst", "EvaluationBatch"]
