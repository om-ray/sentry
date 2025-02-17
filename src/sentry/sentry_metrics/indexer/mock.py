import itertools
from collections import defaultdict
from typing import DefaultDict, Dict, Mapping, Optional, Set

from sentry.sentry_metrics.configuration import UseCaseKey
from sentry.sentry_metrics.indexer.base import (
    FetchType,
    KeyResults,
    OrgId,
    StringIndexer,
    UseCaseKeyCollection,
    UseCaseKeyResult,
    UseCaseKeyResults,
)
from sentry.sentry_metrics.indexer.strings import StaticStringIndexer
from sentry.sentry_metrics.use_case_id_registry import REVERSE_METRIC_PATH_MAPPING, UseCaseID


class RawSimpleIndexer(StringIndexer):

    """Simple indexer with in-memory store. Do not use in production."""

    def __init__(self) -> None:
        self._counter = itertools.count(start=10000)
        self._strings: DefaultDict[
            UseCaseID, DefaultDict[OrgId, DefaultDict[str, Optional[int]]]
        ] = defaultdict(lambda: defaultdict(lambda: defaultdict(self._counter.__next__)))
        self._reverse: Dict[int, str] = {}

    def bulk_record(
        self, use_case_id: UseCaseKey, org_strings: Mapping[int, Set[str]]
    ) -> KeyResults:
        res = self._uca_bulk_record({REVERSE_METRIC_PATH_MAPPING[use_case_id]: org_strings})
        return res.results[REVERSE_METRIC_PATH_MAPPING[use_case_id]]

    def record(self, use_case_id: UseCaseKey, org_id: int, string: str) -> Optional[int]:
        res = self._uca_bulk_record({REVERSE_METRIC_PATH_MAPPING[use_case_id]: {org_id: {string}}})
        return res.results[REVERSE_METRIC_PATH_MAPPING[use_case_id]][org_id][string]

    def _uca_bulk_record(
        self, strings: Mapping[UseCaseID, Mapping[OrgId, Set[str]]]
    ) -> UseCaseKeyResults:
        db_read_keys = UseCaseKeyCollection(strings)
        db_read_key_results = UseCaseKeyResults()
        for use_case_id, org_strs in strings.items():
            for org_id, strs in org_strs.items():
                for string in strs:
                    id = self._strings[use_case_id][org_id].get(string)
                    if id is not None:
                        db_read_key_results.add_use_case_key_result(
                            UseCaseKeyResult(use_case_id, org_id=org_id, string=string, id=id),
                            fetch_type=FetchType.DB_READ,
                        )

        db_write_keys = db_read_key_results.get_unmapped_use_case_keys(db_read_keys)

        if db_write_keys.size == 0:
            return db_read_key_results

        db_write_key_results = UseCaseKeyResults()
        for use_case_id, org_id, string in db_write_keys.as_tuples():
            db_write_key_results.add_use_case_key_result(
                UseCaseKeyResult(
                    use_case_id=use_case_id,
                    org_id=org_id,
                    string=string,
                    id=self._record(use_case_id, org_id, string),
                ),
                fetch_type=FetchType.FIRST_SEEN,
            )

        return db_read_key_results.merge(db_write_key_results)

    def _uca_record(self, use_case_id: UseCaseID, org_id: int, string: str) -> Optional[int]:
        return self._record(use_case_id, org_id, string)

    def resolve(self, use_case_id: UseCaseKey, org_id: int, string: str) -> Optional[int]:
        strs = self._strings[REVERSE_METRIC_PATH_MAPPING[use_case_id]][org_id]
        return strs.get(string)

    def reverse_resolve(self, use_case_id: UseCaseKey, org_id: int, id: int) -> Optional[str]:
        return self._reverse.get(id)

    def _record(self, use_case_id: UseCaseID, org_id: OrgId, string: str) -> Optional[int]:
        index = self._strings[use_case_id][org_id][string]
        if index is not None:
            self._reverse[index] = string
        return index

    def resolve_shared_org(self, string: str) -> Optional[int]:
        raise NotImplementedError(
            "This class should not be used directly, use the wrapping class SimpleIndexer"
        )

    def reverse_shared_org_resolve(self, id: int) -> Optional[str]:
        raise NotImplementedError(
            "This class should not be used directly, use the wrapping class SimpleIndexer"
        )


class SimpleIndexer(StaticStringIndexer):
    def __init__(self) -> None:
        super().__init__(RawSimpleIndexer())


class MockIndexer(SimpleIndexer):
    """
    Mock string indexer. Comes with a prepared set of strings.
    """
