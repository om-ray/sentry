from sentry import analytics


class NotificationSettingsUpdated(analytics.Event):
    type = "notifications.settings_updated"

    attributes = (
        analytics.Attribute("target_type"),
        analytics.Attribute("actor_id", required=False),
        analytics.Attribute("user_id", required=False),
        analytics.Attribute("team_id", required=False),
    )


analytics.register(NotificationSettingsUpdated)
