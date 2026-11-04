from rest_framework.views import exception_handler


def _first_message(data):
    """Pull one human-readable sentence out of a DRF error payload."""
    if isinstance(data, str):
        return data
    if isinstance(data, list):
        for item in data:
            message = _first_message(item)
            if message:
                return message
        return None
    if isinstance(data, dict):
        if "detail" in data:
            return _first_message(data["detail"])
        for key, value in data.items():
            message = _first_message(value)
            if message:
                return message if key in ("non_field_errors", "detail") else f"{key.replace('_', ' ').capitalize()}: {message}"
    return None


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is not None:
        message = _first_message(response.data) or "An error occurred while processing the request."
        response.data = {
            "success": False,
            "status_code": response.status_code,
            "detail": message,
            "error": {
                "message": message,
                "details": response.data,
            },
        }
    return response
