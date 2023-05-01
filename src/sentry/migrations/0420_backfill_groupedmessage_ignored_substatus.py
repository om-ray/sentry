# Generated by Django 2.2.28 on 2023-04-07 23:43

from django.db import connection, migrations
from psycopg2.extras import execute_values

from sentry.models import GroupStatus
from sentry.new_migrations.migrations import CheckedMigration
from sentry.utils.query import RangeQuerySetWrapper

BATCH_SIZE = 100

UPDATE_QUERY = """
    UPDATE sentry_groupedmessage
    SET substatus = NULL
    FROM (VALUES %s) as data (id, status)
    WHERE sentry_groupedmessage.id = data.id and sentry_groupedmessage.status = data.status
"""


def backfill_substatus(apps, schema_editor):
    Group = apps.get_model("sentry", "Group")

    cursor = connection.cursor()
    batch = []

    for group_id, status, substatus in RangeQuerySetWrapper(
        Group.objects.all().values_list("id", "status", "substatus"),
        result_value_getter=lambda item: item[0],
    ):
        if status is not GroupStatus.IGNORED:
            continue

        if substatus is not None:
            batch.append((group_id, status))

        if len(batch) >= BATCH_SIZE:
            execute_values(cursor, UPDATE_QUERY, batch, page_size=BATCH_SIZE)
            batch = []

    if batch:
        execute_values(cursor, UPDATE_QUERY, batch, page_size=BATCH_SIZE)


class Migration(CheckedMigration):
    # This flag is used to mark that a migration shouldn't be automatically run in production. For
    # the most part, this should only be used for operations where it's safe to run the migration
    # after your code has deployed. So this should not be used for most operations that alter the
    # schema of a table.
    # Here are some things that make sense to mark as dangerous:
    # - Large data migrations. Typically we want these to be run manually by ops so that they can
    #   be monitored and not block the deploy for a long period of time while they run.
    # - Adding indexes to large tables. Since this can take a long time, we'd generally prefer to
    #   have ops run this and not block the deploy. Note that while adding an index is a schema
    #   change, it's completely safe to run the operation after the code has deployed.
    is_dangerous = True

    dependencies = [
        ("sentry", "0419_add_null_constraint_for_org_integration_denorm"),
    ]

    operations = [
        migrations.RunPython(
            backfill_substatus,
            reverse_code=migrations.RunPython.noop,
            hints={"tables": ["sentry_groupedmessage"]},
        ),
    ]
