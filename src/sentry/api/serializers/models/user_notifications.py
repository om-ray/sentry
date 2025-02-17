from collections import defaultdict
from typing import Iterable

from sentry.api.serializers import Serializer
from sentry.models import NotificationSetting, UserOption
from sentry.models.actor import Actor
from sentry.notifications.types import FineTuningAPIKey, NotificationScopeType
from sentry.notifications.utils.legacy_mappings import (
    get_type_from_fine_tuning_key,
    map_notification_settings_to_legacy,
)
from sentry.types.integrations import ExternalProviders


def handle_legacy(notification_type: FineTuningAPIKey, users: Iterable) -> Iterable:
    """For EMAIL and REPORTS, check UserOptions."""
    filter_args = {}
    if notification_type == FineTuningAPIKey.EMAIL:
        filter_args["project_id__isnull"] = False

    key = {
        FineTuningAPIKey.EMAIL: "mail:email",
        FineTuningAPIKey.REPORTS: "reports:disabled-organizations",
    }.get(notification_type)

    return UserOption.objects.filter(key=key, user__in=users, **filter_args).select_related("user")


class UserNotificationsSerializer(Serializer):
    def get_attrs(self, item_list, user, **kwargs):
        notification_type = kwargs["notification_type"]
        type = get_type_from_fine_tuning_key(notification_type)
        if not type:
            data = handle_legacy(notification_type, item_list)
        else:
            actors = Actor.objects.filter(user_id__in=[user.id for user in item_list])
            user_mapping = {user.id: user for user in item_list}
            actor_mapping = {actor.id: user_mapping[actor.user_id] for actor in actors}
            notifications_settings = NotificationSetting.objects._filter(
                ExternalProviders.EMAIL,
                get_type_from_fine_tuning_key(notification_type),
                target_ids=actor_mapping.keys(),
            ).exclude(scope_type=NotificationScopeType.USER.value)
            data = map_notification_settings_to_legacy(notifications_settings, actor_mapping)

        results = defaultdict(list)
        for uo in data:
            results[uo.user].append(uo)

        return results

    def serialize(self, obj, attrs, user, **kwargs):
        notification_type = kwargs["notification_type"]
        data = {}

        for uo in attrs:
            if notification_type == FineTuningAPIKey.REPORTS:
                # UserOption for key=reports:disabled-organizations saves a list of orgIds
                # that should not receive reports
                # This UserOption should have both project + organization = None
                for org_id in uo.value:
                    data[org_id] = "0"
            elif uo.project_id is not None:
                data[uo.project_id] = str(uo.value)
            elif uo.organization_id is not None:
                data[uo.organization_id] = str(uo.value)
        return data
