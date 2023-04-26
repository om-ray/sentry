__all__ = ("Geo",)

from sentry.interfaces.base import Interface


class Geo(Interface):
    """
    The (approximate) geographical location of the end user.

    >>> {
    >>>     'country_code': 'US',
    >>>     'city': 'San Francisco',
    >>>     'region': 'CA',
    >>>     'subdivision': 'California',
    >>> }
    """

    @classmethod
    def to_python(cls, data, **kwargs):
        data = {
            "country_code": data.get("country_code"),
            "city": data.get("city"),
            "region": data.get("region"),
            "subdivision": data.get("subdivision"),
        }

        return super().to_python(data, **kwargs)
