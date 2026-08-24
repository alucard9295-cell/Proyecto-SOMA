"""Logging estructurado en JSON.

Una linea por evento, en JSON, con `request_id`. Eso es lo que permite tomar el
identificador que ve el usuario en un error y encontrar la traza exacta. El
logging por defecto de uvicorn no se puede correlacionar.
"""

from datetime import datetime, timezone
import json
import logging
import sys


# Atributos que trae todo LogRecord: cualquier otro es contexto que agrego yo.
_STANDARD = {
    "args", "asctime", "created", "exc_info", "exc_text", "filename",
    "funcName", "levelname", "levelno", "lineno", "module", "msecs",
    "message", "msg", "name", "pathname", "process", "processName",
    "relativeCreated", "stack_info", "taskName", "thread", "threadName",
}

# Nunca deben salir en un log, ni siquiera por accidente.
_SENSITIVE = {"password", "token", "secret", "authorization", "api_key", "cookie"}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.fromtimestamp(record.created, timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        for key, value in record.__dict__.items():
            if key in _STANDARD or key.startswith("_"):
                continue
            if any(word in key.lower() for word in _SENSITIVE):
                payload[key] = "[REDACTED]"
            else:
                payload[key] = value

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(payload, ensure_ascii=False, default=str)


def configure_logging(level: str = "INFO") -> None:
    """Instala el formato JSON en la raiz y alinea los loggers de uvicorn."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level.upper())

    # uvicorn trae sus propios handlers; se dejan propagar a la raiz para que
    # todo salga con el mismo formato.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(name)
        logger.handlers.clear()
        logger.propagate = True

    # El log de acceso de uvicorn duplica lo que ya registra RequestIdMiddleware.
    logging.getLogger("uvicorn.access").disabled = True
